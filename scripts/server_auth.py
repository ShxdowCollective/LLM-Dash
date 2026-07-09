#!/usr/bin/env python3
"""HTTP access controls for the LLM-Dash server.

Two independent protections, both wired into a single request middleware in
``server.py``:

1. **Host / Origin guard (always on).** Rejects requests whose ``Host`` header is
   not an expected local/LAN name (defeats DNS-rebinding, which would arrive with
   the attacker's own host) and, for state-changing methods, requests whose
   ``Origin`` is cross-site (defeats cross-site form/`fetch` POSTs against a
   loopback install). This closes the loopback-only attack surface regardless of
   whether the bearer token is required.

2. **Per-install bearer token (only when exposed).** When the server is bound to a
   non-loopback host (``--host 0.0.0.0`` / a LAN IP), every mutating ``/api`` route
   requires ``Authorization: Bearer <token>``. A loopback-only bind stays
   token-free so the single-operator local flow keeps working with zero friction.
"""

from __future__ import annotations

import ipaddress
import os
import secrets
import socket
from pathlib import Path
from urllib.parse import urlsplit

TOKEN_ENV = "LLM_DASH_ACCESS_TOKEN"
BIND_HOST_ENV = "LLM_DASH_BIND_HOST"
HOST_ENV = "LLM_DASH_HOST"
ALLOWED_HOSTS_ENV = "LLM_DASH_ALLOWED_HOSTS"

UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
# Loopback hostnames — a bind to any of these needs no token.
LOOPBACK_HOSTS = frozenset({"", "127.0.0.1", "::1", "localhost", "ip6-localhost"})


def _token_path() -> Path:
    from scripts.config import shxdow_root

    return shxdow_root() / "config" / "llmdash_access_token"


def load_or_create_token() -> str:
    """Return the per-install bearer token, generating and persisting one on first
    use. An explicit ``LLM_DASH_ACCESS_TOKEN`` env var always wins."""
    env = (os.environ.get(TOKEN_ENV) or "").strip()
    if env:
        return env
    path = _token_path()
    try:
        existing = path.read_text(encoding="utf-8").strip()
        if existing:
            return existing
    except (FileNotFoundError, OSError):
        pass
    token = secrets.token_urlsafe(32)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(token + "\n", encoding="utf-8")
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
    except OSError:
        # Non-persistent fallback: a token that lives only for this process is
        # still better than none once the server is exposed.
        pass
    return token


def _norm_host(value: str) -> str:
    """Lowercase host without a port or IPv6 brackets."""
    host = str(value or "").strip().lower()
    if not host:
        return ""
    # Strip scheme if a full URL slipped in.
    if "://" in host:
        host = urlsplit(host).netloc or host
    if host.startswith("["):
        # [::1]:8787 or [::1]
        end = host.find("]")
        if end != -1:
            return host[1:end]
        return host.strip("[]")
    # Only split a port off a plain host:port (a bare IPv6 has many colons).
    if host.count(":") == 1:
        host = host.split(":", 1)[0]
    return host


def bind_host() -> str:
    return (
        os.environ.get(BIND_HOST_ENV)
        or os.environ.get(HOST_ENV)
        or "127.0.0.1"
    ).strip()


def is_loopback_bind() -> bool:
    return _norm_host(bind_host()) in LOOPBACK_HOSTS


def token_required() -> bool:
    """The token is enforced only when the server is reachable off-host."""
    return not is_loopback_bind()


def scope_server_is_exposed(server: object) -> bool:
    """Fallback exposure check for a server started directly (``uvicorn
    server:app --host 0.0.0.0``) without the launcher's ``LLM_DASH_BIND_HOST``.

    ``scope["server"]`` is the connection's *local* socket address, so a request
    arriving over the network shows the machine's LAN IP (-> non-loopback ->
    token required), while a same-host loopback client shows 127.0.0.1 (safe,
    stays token-free). A non-IP host (the test client's ``testserver``) yields
    ``False`` and defers to the env gate. The launcher path sets
    ``LLM_DASH_BIND_HOST`` so ``token_required()`` already covers every client."""
    try:
        host = str((server or ("", 0))[0] or "")
    except (TypeError, IndexError):
        return False
    if not host:
        return False
    try:
        ip = ipaddress.ip_address(_norm_host(host))
    except ValueError:
        return False
    # 0.0.0.0 / :: (unspecified) means "all interfaces" -> exposed.
    return not ip.is_loopback


def request_needs_token(server: object) -> bool:
    return token_required() or scope_server_is_exposed(server)


def _primary_ipv4() -> str | None:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            ip = sock.getsockname()[0]
            if ip and not ip.startswith("127."):
                return ip
    except OSError:
        pass
    return None


def allowed_hosts() -> set[str]:
    hosts: set[str] = {"127.0.0.1", "::1", "localhost", "ip6-localhost"}
    bind = _norm_host(bind_host())
    # A wildcard bind is reachable at the machine's real address(es); allow those
    # rather than the meaningless 0.0.0.0/:: literal.
    if bind and bind not in {"0.0.0.0", "::"}:
        hosts.add(bind)
    primary = _primary_ipv4()
    if primary:
        hosts.add(primary)
    for extra in (os.environ.get(ALLOWED_HOSTS_ENV) or "").split(","):
        norm = _norm_host(extra)
        if norm:
            hosts.add(norm)
    # Starlette's TestClient always sends Host: testserver — allow it under pytest
    # only, never in a real deployment.
    if os.environ.get("PYTEST_CURRENT_TEST"):
        hosts.add("testserver")
    return hosts


def host_allowed(host_header: str | None) -> bool:
    host = _norm_host(host_header or "")
    if not host:
        # No Host header (non-browser client) can't be leveraged for rebinding.
        return True
    return host in allowed_hosts()


def origin_allowed(origin: str | None, host_header: str | None) -> bool:
    """A same-origin (or absent) Origin passes; a cross-site Origin is rejected."""
    value = str(origin or "").strip()
    if not value or value.lower() == "null":
        # Absent Origin: not a cross-site browser POST we can attribute; the Host
        # guard still applies. Non-browser callers (curl, tests) land here.
        return True
    origin_host = _norm_host(value)
    return origin_host in allowed_hosts() or origin_host == _norm_host(host_header or "")


def extract_bearer(auth_header: str | None) -> str:
    value = str(auth_header or "").strip()
    if value.lower().startswith("bearer "):
        return value[7:].strip()
    return ""


def token_matches(auth_header: str | None, token: str) -> bool:
    supplied = extract_bearer(auth_header)
    if not supplied or not token:
        return False
    return secrets.compare_digest(supplied, token)
