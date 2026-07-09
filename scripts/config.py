#!/usr/bin/env python3
"""LLM-Dash Agent Provider config and credential helpers."""

from __future__ import annotations

import ipaddress
import json
import logging
import os
import re
import socket
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

try:
    from scripts import voidware_auth
except ModuleNotFoundError:
    import voidware_auth  # type: ignore

logger = logging.getLogger("llm_dash.config")

APP_NAME = "llmdash"
KEYRING_SERVICE = "shxdow.llmdash"
PROVIDER_KEY_NAME = "LLM_DASH_PROVIDER_API_KEY"
EXA_KEY_NAME = "EXA_API_KEY"
CONFIG_ENV_PREFIX = "LLM_DASH_"
SHXDOW_ROOT_ENV = "LLM_DASH_SHXDOW_ROOT"

PROVIDER_BASE_URL_ENVS = ("LLM_DASH_BASE_URL", "LLM_DASH_PROVIDER_BASE_URL", "BASE_URL")
PROVIDER_API_KEY_ENVS = ("LLM_DASH_API_KEY", "LLM_DASH_PROVIDER_API_KEY", "NANOGPT_API_KEY", "API_KEY")
PROVIDER_KEY_NAMES = (PROVIDER_KEY_NAME, "NANOGPT_API_KEY")
MODELS_OVERRIDE_URL_ENVS = ("LLM_DASH_MODELS_OVERRIDE_URL", "MODELS_OVERRIDE_URL")
DEFAULT_MODEL_ENVS = ("LLM_DASH_DEFAULT_MODEL", "DEFAULT_MODEL")
BACKUP_MODEL_ENVS = ("LLM_DASH_BACKUP_MODEL", "BACKUP_MODEL")
REQUEST_HEADERS_ENV = "LLM_DASH_REQUEST_HEADERS_JSON"
ENDPOINT_MODE_ENV = "LLM_DASH_ENDPOINT_MODE"
EXA_API_KEY_ENVS = ("EXA_API_KEY", "LLM_DASH_EXA_API_KEY")
LLMSTATS_KEY_NAME = "LLM_STATS_API_KEY"
LLMSTATS_API_KEY_ENVS = ("LLM_STATS_API_KEY", "LLM_DASH_LLMSTATS_API_KEY")
LLMSTATS_BASE_URL = "https://api.llm-stats.com/stats"
AA_KEY_NAME = "AA_API_KEY"
AA_API_KEY_ENVS = ("AA_API_KEY", "ARTIFICIAL_ANALYSIS_API_KEY", "LLM_DASH_AA_API_KEY")
AA_BASE_URL = "https://artificialanalysis.ai/api/v2"

SENSITIVE_HEADER_PARTS = ("authorization", "api-key", "apikey", "x-api-key", "token", "secret", "key")
ENDPOINT_MODE_APPEND_V1 = "append_v1"
ENDPOINT_MODE_ROOT = "root"
ENDPOINT_MODES = {ENDPOINT_MODE_APPEND_V1, ENDPOINT_MODE_ROOT}
SECRET_REMOVE_FALLBACK_CODES = {"broker_unavailable", "broker_timeout", "cli_unavailable"}
CONFIG_VERSION = 2
CREDENTIAL_SLOTS = ("provider", "exa", "llmstats", "aa")
SLOT_ENV_KEYS = {
    "provider": PROVIDER_API_KEY_ENVS,
    "exa": EXA_API_KEY_ENVS,
    "llmstats": LLMSTATS_API_KEY_ENVS,
    "aa": AA_API_KEY_ENVS,
}
SLOT_KEY_NAMES = {
    "provider": PROVIDER_KEY_NAMES,
    "exa": (EXA_KEY_NAME,),
    "llmstats": (LLMSTATS_KEY_NAME,),
    "aa": (AA_KEY_NAME,),
}
SLOT_DEFAULT_SECRET_NAMES = {
    "provider": voidware_auth.PROVIDER_SECRET_NAME,
    "exa": voidware_auth.EXA_SECRET_NAME,
    "llmstats": voidware_auth.LLMSTATS_SECRET_NAME,
    "aa": voidware_auth.AA_SECRET_NAME,
}
SLOT_MANAGED_KINDS = {
    "provider": "agent-provider",
    "exa": "exa",
    "llmstats": "llmstats",
    "aa": "aa",
}


class ConfigError(ValueError):
    pass


@dataclass(frozen=True)
class ProviderConfig:
    base_url: str = ""
    models_override_url: str = ""
    default_model: str = ""
    backup_model: str = ""
    endpoint_mode: str = ENDPOINT_MODE_APPEND_V1
    request_headers: dict[str, str] | None = None
    provider_credential_name: str = ""
    provider_credential_ref: str = ""
    provider_credential_meta: dict[str, Any] | None = None
    provider_credential_grant: dict[str, Any] | None = None


@dataclass(frozen=True)
class CredentialSlotConfig:
    credential_name: str = ""
    credential_ref: str = ""
    credential_meta: dict[str, Any] | None = None
    credential_grant: dict[str, Any] | None = None


@dataclass(frozen=True)
class ProviderSecrets:
    api_key: str = ""


@dataclass(frozen=True)
class ProviderBundle:
    config: ProviderConfig
    secrets: ProviderSecrets

    @property
    def has_provider(self) -> bool:
        return bool(self.config.base_url and self.config.default_model and self.secrets.api_key)

    @property
    def chat_endpoint(self) -> str:
        return chat_endpoint(self.config.base_url, self.config.endpoint_mode) if self.config.base_url else ""

    @property
    def models_endpoint(self) -> str:
        base = self.config.models_override_url or self.config.base_url
        return models_endpoint(base, self.config.endpoint_mode) if base else ""


def shxdow_root() -> Path:
    override = os.environ.get(SHXDOW_ROOT_ENV)
    if override:
        return Path(override).expanduser()
    return Path.home() / ".shxdow"


def auth_path() -> Path:
    return shxdow_root() / "auth.json"


def config_path() -> Path:
    return shxdow_root() / "config" / "shxdow.llmdash.json"


# Tolerates JSONC: line comments, block comments, and trailing commas. Other
# Voidware tools may write to ~/.shxdow/config/shxdow.llmdash.json and add
# comments back, so a strict json.load was a permanent wizard-auto-open trap.
_JSONC_TOKENS = re.compile(
    r'"(?:\\.|[^"\\])*"|/\*[\s\S]*?\*/|//[^\n]*',
)
_JSONC_TRAILING_COMMAS = re.compile(r",(\s*[\]}])")


def _strip_jsonc(text: str) -> str:
    def replace(match: re.Match[str]) -> str:
        token = match.group(0)
        return token if token.startswith('"') else ""

    stripped = _JSONC_TOKENS.sub(replace, text)
    return _JSONC_TRAILING_COMMAS.sub(r"\1", stripped)


def _read_json(path: Path) -> dict[str, Any]:
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return {}
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        try:
            data = json.loads(_strip_jsonc(text))
        except json.JSONDecodeError as exc:
            raise ConfigError(f"Invalid JSON in {path}: {exc}") from exc
    return data if isinstance(data, dict) else {}


def _atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent), text=True)
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, sort_keys=True)
            f.write("\n")
        tmp.replace(path)
    finally:
        if tmp.exists():
            tmp.unlink()


def _env_first(names: tuple[str, ...]) -> str:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value.strip()
    return ""


def _load_config_file() -> dict[str, Any]:
    data = _read_json(config_path())
    if "provider" in data:
        migrated = _migrate_config_v2(data)
        if migrated is not data:
            _atomic_write_json(config_path(), migrated)
        return migrated
    if APP_NAME in data and isinstance(data[APP_NAME], dict):
        return _migrate_config_v2(data[APP_NAME])
    return _migrate_config_v2(data)


def _slot_section_key(slot: str) -> str:
    if slot == "provider":
        return "provider"
    return slot


def _slot_field_prefix(slot: str) -> str:
    if slot == "provider":
        return "provider_credential"
    return f"{slot}_credential"


def _load_slot_section(data: dict[str, Any], slot: str) -> dict[str, Any]:
    section = data.get(_slot_section_key(slot), {})
    return section if isinstance(section, dict) else {}


def _slot_selection_from_section(slot: str, section: dict[str, Any]) -> CredentialSlotConfig:
    prefix = _slot_field_prefix(slot)
    grant = section.get(f"{prefix}_grant")
    return CredentialSlotConfig(
        credential_name=str(section.get(f"{prefix}_name") or "").strip(),
        credential_ref=str(section.get(f"{prefix}_ref") or "").strip(),
        credential_meta=_safe_provider_credential_meta(section.get(f"{prefix}_meta")),
        credential_grant=grant if isinstance(grant, dict) else {},
    )


def load_credential_slot(slot: str) -> CredentialSlotConfig:
    if slot not in CREDENTIAL_SLOTS:
        raise ConfigError(f"Unknown credential slot: {slot}")
    data = _load_config_file()
    return _slot_selection_from_section(slot, _load_slot_section(data, slot))


def _discovered_secret_names() -> set[str]:
    names: set[str] = set()
    try:
        for item in voidware_auth.discover_auth_refs()[0]:
            if item.get("has_secret") and item.get("name"):
                names.add(str(item["name"]))
    except Exception:
        pass
    try:
        for item in voidware_auth.discover_provider_credentials(reusable_only=False):
            if item.get("hasSecret", item.get("has_secret")) and item.get("name"):
                names.add(str(item["name"]))
    except Exception:
        pass
    return names


def _migrate_config_v2(data: dict[str, Any]) -> dict[str, Any]:
    if int(data.get("version") or 1) >= CONFIG_VERSION:
        return data
    migrated = dict(data)
    migrated["version"] = CONFIG_VERSION
    migrated.setdefault("app", APP_NAME)
    discovered = _discovered_secret_names()
    for slot in ("exa", "llmstats", "aa"):
        section = dict(_load_slot_section(migrated, slot))
        prefix = _slot_field_prefix(slot)
        if not section.get(f"{prefix}_name"):
            default_name = SLOT_DEFAULT_SECRET_NAMES[slot]
            if default_name in discovered:
                section[f"{prefix}_name"] = default_name
                section.setdefault(f"{prefix}_meta", {"name": default_name, "label": default_name})
        migrated[slot] = section
    provider = dict(_load_slot_section(migrated, "provider"))
    migrated["provider"] = provider
    return migrated


def _keyring_get(name: str) -> str:
    try:
        import keyring
    except Exception:
        return ""
    try:
        return keyring.get_password(KEYRING_SERVICE, name) or ""
    except Exception:
        return ""


def _keyring_set(name: str, value: str) -> bool:
    try:
        import keyring
    except Exception:
        return False
    try:
        keyring.set_password(KEYRING_SERVICE, name, value)
        return True
    except Exception:
        return False


def _keyring_delete(name: str) -> bool:
    try:
        import keyring
    except Exception:
        return False
    try:
        keyring.delete_password(KEYRING_SERVICE, name)
        return True
    except Exception:
        return False


def _legacy_secret(name: str) -> str:
    return _keyring_get(name)


def _read_broker_secret(name: str, *, credential_ref: str = "") -> str:
    try:
        return str(voidware_auth.read_secret_with_grant(
            name,
            credential_ref=credential_ref or None,
        ).get("secret") or "")
    except voidware_auth.VoidwareAuthError as exc:
        # "Needs a fresh interactive grant" / "no durable secret stored" is the
        # expected not-configured path — stay quiet so the caller falls back to
        # the next credential source. A broker/bridge that is *unavailable or
        # failing* is a distinct operational fault the operator should see, so
        # surface it at WARNING (broker_status() already carries it to the UI).
        if exc.code not in voidware_auth.FRESH_GRANT_CODES:
            logger.warning(
                "Voidware broker unavailable while reading secret %r (code=%s): %s",
                name or credential_ref, exc.code, exc,
            )
        return ""


def _read_secret(
    envs: tuple[str, ...],
    key_name: str | tuple[str, ...],
    broker_name: str | None = None,
    selected_name: str | None = None,
    selected_ref: str | None = None,
) -> str:
    key_names = (key_name,) if isinstance(key_name, str) else key_name
    env_secret = _env_first(envs)
    if env_secret:
        return env_secret
    if selected_ref or selected_name:
        selected_secret = _read_broker_secret(selected_name or "", credential_ref=selected_ref or "")
        if selected_secret:
            return selected_secret
    if broker_name:
        broker_secret = _read_broker_secret(broker_name)
        if broker_secret:
            return broker_secret
    for name in key_names:
        secret = _read_broker_secret(name)
        if secret:
            return secret
    for name in key_names:
        secret = _legacy_secret(name)
        if secret:
            return secret
    return ""


def _credential_source(
    envs: tuple[str, ...],
    key_name: str | tuple[str, ...],
    broker_name: str | None = None,
    selected_name: str | None = None,
    selected_ref: str | None = None,
    selected_grant: dict[str, Any] | None = None,
) -> dict[str, Any]:
    key_names = (key_name,) if isinstance(key_name, str) else key_name
    env_value = _env_first(envs)
    if env_value:
        env_var = next((name for name in envs if os.environ.get(name)), envs[0] if envs else "")
        return {
            "configured": True,
            "source": "env",
            "source_label": "env",
            "read_only": True,
            "env_var": env_var,
            "legacy_migration_available": False,
            "grant_status": {"status": "none", "renewal_recommended": False, "expires_at": ""},
        }
    discovered_names = set()
    try:
        discovered_names = {
            str(item.get("name"))
            for item in voidware_auth.discover_provider_credentials(reusable_only=False)
            if item.get("name") and item.get("hasSecret", item.get("has_secret", False))
        }
    except Exception:
        discovered_names = set()
    parsed_ref = voidware_auth.safe_credential_ref(selected_ref)
    if selected_name or parsed_ref:
        name = str(parsed_ref.get("name") if parsed_ref else selected_name or "")
        return {
            "configured": name in discovered_names or bool(selected_grant) or bool(parsed_ref),
            "source": "voidware-provider" if parsed_ref else "voidware-provider",
            "source_label": voidware_auth.source_label(str(parsed_ref.get("source") or "")) if parsed_ref else "selected",
            "name": name,
            "ref": parsed_ref,
            "grant": selected_grant or {},
            "grant_status": voidware_auth.grant_renewal_status(selected_grant),
            "managed_by_llmdash": voidware_auth.credential_managed_by_llmdash(
                ref=parsed_ref or None,
                name=name,
            ),
            "legacy_migration_available": any(_legacy_secret(item) for item in key_names),
        }
    for name in [*( [broker_name] if broker_name else [] ), *key_names]:
        if name and name in discovered_names:
            return {
                "configured": True,
                "source": "voidware-broker",
                "source_label": "keyring",
                "name": name,
                "grant_status": {"status": "none", "renewal_recommended": False, "expires_at": ""},
                "legacy_migration_available": any(_legacy_secret(item) for item in key_names),
            }
    fallback_source = ""
    for name in key_names:
        if _keyring_get(name):
            fallback_source = "voidware-keystore"
            break
    return {
        "configured": bool(fallback_source),
        "source": fallback_source or "missing",
        "source_label": "none" if not fallback_source else "keyring",
        "grant_status": {"status": "none", "renewal_recommended": False, "expires_at": ""},
        "legacy_migration_available": False,
    }


def _normalize_header_map(raw: Any) -> dict[str, str]:
    if raw in (None, ""):
        return {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ConfigError(f"{REQUEST_HEADERS_ENV} must be valid JSON") from exc
    if not isinstance(raw, dict):
        raise ConfigError("request_headers must be an object")
    headers: dict[str, str] = {}
    for key, value in raw.items():
        name = str(key).strip()
        if not name:
            continue
        if "\n" in name or "\r" in name:
            raise ConfigError("request header names cannot contain newlines")
        val = str(value).strip()
        if "\n" in val or "\r" in val:
            raise ConfigError("request header values cannot contain newlines")
        headers[name] = val
    return headers


def normalize_endpoint_mode(value: str | None) -> str:
    mode = str(value or "").strip().lower().replace("-", "_")
    aliases = {
        "": ENDPOINT_MODE_APPEND_V1,
        "v1": ENDPOINT_MODE_APPEND_V1,
        "openai_v1": ENDPOINT_MODE_APPEND_V1,
        "append_v1": ENDPOINT_MODE_APPEND_V1,
        "provider_root": ENDPOINT_MODE_ROOT,
        "passthrough": ENDPOINT_MODE_ROOT,
        "root": ENDPOINT_MODE_ROOT,
    }
    normalized = aliases.get(mode, mode)
    if normalized not in ENDPOINT_MODES:
        raise ConfigError("endpoint_mode must be 'append_v1' or 'root'")
    return normalized


def normalize_base_url(value: str, *, field: str = "base_url", allow_v1: bool = False) -> str:
    url = str(value or "").strip().rstrip("/")
    if not url:
        return ""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ConfigError(f"{field} must be an absolute http(s) URL")
    if not allow_v1 and parsed.path.rstrip("/").endswith("/v1"):
        raise ConfigError(f"{field} must not include /v1")
    if parsed.params or parsed.query or parsed.fragment:
        raise ConfigError(f"{field} must not include params, query, or fragment")
    return url


ALLOW_LOCAL_ENDPOINTS_ENV = "LLM_DASH_ALLOW_LOCAL_ENDPOINTS"


def _local_endpoints_allowed() -> bool:
    return str(os.environ.get(ALLOW_LOCAL_ENDPOINTS_ENV) or "").strip().lower() in {"1", "true", "yes", "on"}


def _address_is_blocked(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return False
    return (
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def guard_ssrf(url: str, *, field: str = "base_url") -> None:
    """Reject a caller-supplied URL that resolves to a non-public address.

    Defends the provider test-connection and custom-endpoint seed/refresh paths
    against SSRF (loopback / RFC1918 / link-local / multicast). Operators who run
    a local model server (e.g. Ollama) opt in with
    ``LLM_DASH_ALLOW_LOCAL_ENDPOINTS=1``. DNS is resolved and every returned
    address is checked, so a hostname that maps to a private IP is also blocked.
    """
    if _local_endpoints_allowed():
        return
    host = urlparse(str(url or "")).hostname
    if not host:
        return
    # A bracketed/plain IP literal — check directly.
    if _address_is_blocked(host):
        raise ConfigError(f"{field} resolves to a blocked non-public address")
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise ConfigError(f"{field} host could not be resolved: {host}") from exc
    for info in infos:
        sockaddr = info[4]
        if sockaddr and _address_is_blocked(str(sockaddr[0])):
            raise ConfigError(
                f"{field} resolves to a blocked non-public address "
                f"(set {ALLOW_LOCAL_ENDPOINTS_ENV}=1 to allow local endpoints)"
            )


def normalize_provider_model_id(base_url: str, model_id: str) -> str:
    model = str(model_id or "").strip()
    base = str(base_url or "").strip().lower()
    opencode_prefix = "opencode-go/"
    if base and "opencode.ai/zen/go" in base and model.lower().startswith(opencode_prefix):
        return model[len(opencode_prefix):].strip()
    return model


def _endpoint_base(base_url: str, endpoint_mode: str) -> str:
    mode = normalize_endpoint_mode(endpoint_mode)
    if mode == ENDPOINT_MODE_ROOT:
        return normalize_base_url(base_url, allow_v1=True)
    return f"{normalize_base_url(base_url)}/v1"


def is_models_endpoint_url(value: str) -> bool:
    parsed = urlparse(str(value or "").strip())
    return parsed.path.rstrip("/").endswith("/models")


def chat_endpoint(base_url: str, endpoint_mode: str = ENDPOINT_MODE_APPEND_V1) -> str:
    return f"{_endpoint_base(base_url, endpoint_mode)}/chat/completions"


def models_endpoint(base_url: str, endpoint_mode: str = ENDPOINT_MODE_APPEND_V1) -> str:
    if is_models_endpoint_url(base_url):
        return normalize_base_url(base_url, field="models_endpoint", allow_v1=True)
    return f"{_endpoint_base(base_url, endpoint_mode)}/models"


def provider_api_base(base_url: str, endpoint_mode: str = ENDPOINT_MODE_APPEND_V1) -> str:
    return _endpoint_base(base_url, endpoint_mode)


def is_sensitive_header(name: str) -> bool:
    lowered = name.lower()
    return any(part in lowered for part in SENSITIVE_HEADER_PARTS)


def redact_value(value: str, *, keep: int = 4) -> str:
    if not value:
        return ""
    if len(value) <= keep:
        return "***"
    return f"***{value[-keep:]}"


def redact_headers(headers: dict[str, str] | None) -> dict[str, str]:
    return {
        key: (redact_value(value) if is_sensitive_header(key) else value)
        for key, value in (headers or {}).items()
    }


def _safe_provider_credential_meta(raw: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    allowed = {
        "name",
        "label",
        "source",
        "sources",
        "has_secret",
        "hasSecret",
        "keyring_backed",
        "keyringBacked",
        "reusability",
        "provider_family",
        "providerFamily",
        "protocol",
        "api_format",
        "apiFormat",
        "base_url",
        "baseURL",
        "models_url",
        "modelsURL",
        "chat_url",
        "chatURL",
        "safe_custom",
        "safeCustom",
    }
    cleaned: dict[str, Any] = {}
    for key, value in raw.items():
        if key not in allowed:
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            cleaned[key] = value
        elif isinstance(value, list):
            cleaned[key] = [str(item) for item in value if isinstance(item, (str, int, float, bool))]
        elif isinstance(value, dict) and key in {"safe_custom", "safeCustom"}:
            cleaned[key] = {
                str(k): v
                for k, v in value.items()
                if isinstance(k, str) and isinstance(v, (str, int, float, bool)) and not is_sensitive_header(k)
            }
    return cleaned


def _infer_candidate_endpoint_mode(base_url: str) -> str:
    parsed = urlparse(str(base_url or "").strip())
    path = parsed.path.rstrip("/")
    if path.endswith("/v1") or path.endswith("/openai") or path.endswith("/gateway"):
        return ENDPOINT_MODE_ROOT
    return ENDPOINT_MODE_APPEND_V1


def _provider_candidate(candidate: dict[str, Any]) -> dict[str, Any] | None:
    name = str(candidate.get("name") or "").strip()
    base_url = str(candidate.get("baseURL") or candidate.get("base_url") or "").strip().rstrip("/")
    if not name or not base_url or not candidate.get("hasSecret", candidate.get("has_secret", False)):
        return None
    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    models_url = str(candidate.get("modelsURL") or candidate.get("models_url") or "").strip().rstrip("/")
    chat_url = str(candidate.get("chatURL") or candidate.get("chat_url") or "").strip().rstrip("/")
    safe_custom = candidate.get("safeCustom") if isinstance(candidate.get("safeCustom"), dict) else {}
    safe_custom = _safe_provider_credential_meta({"safeCustom": safe_custom}).get("safeCustom", {})
    shaped: dict[str, Any] = {
        "name": name,
        "label": str(candidate.get("label") or name),
        "source": str(candidate.get("source") or ""),
        "sources": [str(item) for item in candidate.get("sources", []) if isinstance(item, (str, int, float, bool))],
        "has_secret": True,
        "keyring_backed": bool(candidate.get("keyringBacked", candidate.get("keyring_backed", False))),
        "reusability": str(candidate.get("reusability") or ""),
        "provider_family": str(candidate.get("providerFamily") or candidate.get("provider_family") or ""),
        "protocol": str(candidate.get("protocol") or "http"),
        "api_format": str(candidate.get("apiFormat") or candidate.get("api_format") or ""),
        "base_url": base_url,
        "models_url": models_url,
        "chat_url": chat_url,
        "endpoint_mode": _infer_candidate_endpoint_mode(base_url),
        "safe_custom": safe_custom,
    }
    ref = voidware_auth.safe_credential_ref(candidate.get("ref"))
    if ref:
        shaped["ref"] = ref
    source_label = str(candidate.get("source_label") or "").strip()
    if source_label:
        shaped["source_label"] = source_label
    if "managed_by_llmdash" in candidate:
        shaped["managed_by_llmdash"] = bool(candidate["managed_by_llmdash"])
    if "locked" in candidate:
        shaped["locked"] = bool(candidate["locked"])
    if "unreadable" in candidate:
        shaped["unreadable"] = bool(candidate["unreadable"])
    return shaped


def discover_provider_credentials() -> dict[str, Any]:
    raw = voidware_auth.discover_provider_credentials(reusable_only=True)
    candidates = []
    seen: set[str] = set()
    for item in raw:
        candidate = _provider_candidate(item)
        if not candidate or candidate["name"] in seen:
            continue
        seen.add(candidate["name"])
        candidates.append(candidate)
    candidates.sort(key=lambda item: (item.get("label") or item["name"]).lower())
    return {"credentials": candidates}


def discover_all_credential_slots() -> dict[str, Any]:
    discovery = voidware_auth.discover_credential_candidates()
    data = _load_config_file()
    slots: dict[str, Any] = {}
    for slot in CREDENTIAL_SLOTS:
        selection = _slot_selection_from_section(slot, _load_slot_section(data, slot))
        auth = _credential_source(
            SLOT_ENV_KEYS[slot],
            SLOT_KEY_NAMES[slot],
            SLOT_DEFAULT_SECRET_NAMES[slot],
            selection.credential_name,
            selection.credential_ref,
            selection.credential_grant,
        )
        if slot == "provider":
            candidates = [
                _provider_candidate(item)
                for item in discovery.get("provider_candidates", [])
            ]
            candidates = [item for item in candidates if item]
        else:
            candidates = list(discovery.get("generic_candidates", []))
        slots[slot] = {
            "selected": {
                "name": selection.credential_name,
                "ref": voidware_auth.safe_credential_ref(selection.credential_ref),
                "meta": selection.credential_meta or {},
                "grant": selection.credential_grant or {},
                "grant_status": auth.get("grant_status") or voidware_auth.grant_renewal_status(selection.credential_grant),
                "managed_by_llmdash": _slot_managed(slot, selection, live_rows=discovery.get("auth_refs") or []),
                "source_label": auth.get("source_label") or ("none" if not auth.get("configured") else "selected"),
                "read_only": bool(auth.get("read_only")),
            },
            "candidates": candidates,
            "env_override": {
                "configured": bool(_env_first(SLOT_ENV_KEYS[slot])),
                "read_only": True,
                "source_label": "env",
                "env_var": next((name for name in SLOT_ENV_KEYS[slot] if os.environ.get(name)), ""),
            },
        }
    return {
        "refs_available": discovery.get("refs_available", False),
        "same_name_warnings": discovery.get("same_name_warnings", []),
        "slots": slots,
    }


def _persist_config(data: dict[str, Any]) -> None:
    data["version"] = CONFIG_VERSION
    data["app"] = APP_NAME
    _atomic_write_json(config_path(), data)


def _ref_identity(ref: dict[str, Any]) -> tuple[str, str, str, str]:
    return (
        str(ref.get("name") or ""),
        str(ref.get("source") or ""),
        str(ref.get("authFilePath") or ""),
        str(ref.get("envVar") or ""),
    )


def _resolved_mutation_ref(raw: str | dict[str, Any] | None) -> dict[str, Any]:
    """Parse a persisted slot ref, failing closed when it is set but invalid.

    A slot that records an external `credential_ref` must mutate that exact
    source. If the stored ref is present but unparseable we refuse rather than
    silently fall back to a name-bound write/delete that could hit a same-name
    credential on a different source.
    """
    ref = voidware_auth.safe_credential_ref(raw)
    if raw and not ref:
        raise ConfigError(
            "Stored credential ref is invalid; re-select the credential source before changing it."
        )
    return ref


def _selection_managed_live(
    selection: CredentialSlotConfig,
    *,
    live_rows: list[dict[str, Any]] | None = None,
) -> bool | None:
    """Ownership from live Voidware metadata; None when discovery is unavailable.

    Name-only selections are managed only when every same-name source row is
    LLM-Dash-managed, so ambiguous same-name externals fail closed.
    """
    ref = voidware_auth.safe_credential_ref(selection.credential_ref)
    name = str((ref.get("name") if ref else "") or selection.credential_name or "")
    if not name:
        return None
    rows = live_rows
    if rows is None:
        try:
            rows, refs_available = voidware_auth.discover_auth_refs()
        except voidware_auth.VoidwareAuthError:
            return None
        if not refs_available and not rows:
            return None
    matches = [row for row in rows if isinstance(row, dict) and str(row.get("name") or "") == name]
    if ref:
        ident = _ref_identity(ref)
        refined = [
            row for row in matches
            if isinstance(row.get("ref"), dict) and _ref_identity(row["ref"]) == ident
        ]
        if refined:
            matches = refined
    if not matches:
        return None
    return all(bool(row.get("managed_by_llmdash")) for row in matches)


def _slot_managed(
    slot: str,
    selection: CredentialSlotConfig,
    *,
    live_rows: list[dict[str, Any]] | None = None,
) -> bool:
    _ = slot
    live = _selection_managed_live(selection, live_rows=live_rows)
    if live is not None:
        return live
    ref = voidware_auth.safe_credential_ref(selection.credential_ref)
    meta = selection.credential_meta or {}
    custom = meta.get("custom") if isinstance(meta.get("custom"), dict) else None
    return voidware_auth.credential_managed_by_llmdash(ref=ref or None, custom=custom, name=selection.credential_name)


def _require_external_mutation_allowed(
    slot: str,
    *,
    external_mutation: bool,
    require_fresh_grant: bool,
) -> tuple[CredentialSlotConfig, bool]:
    selection = load_credential_slot(slot)
    if not selection.credential_name and not selection.credential_ref:
        raise ConfigError(f"No credential is selected for slot '{slot}'.")
    managed = _slot_managed(slot, selection)
    if managed:
        return selection, True
    if not external_mutation or not require_fresh_grant:
        raise ConfigError(
            "This credential is not managed by LLM-Dash. External mutation requires "
            "external_mutation=true and require_fresh_grant=true."
        )
    return selection, False


def select_credential_slot(
    slot: str,
    *,
    credential_name: str = "",
    credential_ref: str | dict[str, Any] | None = None,
    credential_meta: dict[str, Any] | None = None,
) -> CredentialSlotConfig:
    if slot not in CREDENTIAL_SLOTS:
        raise ConfigError(f"Unknown credential slot: {slot}")
    ref = voidware_auth.safe_credential_ref(credential_ref)
    name = str(ref.get("name") if ref else credential_name or "").strip()
    if not name:
        raise ConfigError("credential_name or credential_ref is required")
    try:
        secret_info = voidware_auth.read_secret_with_grant(name, credential_ref=ref or credential_ref)
    except voidware_auth.VoidwareAuthError as exc:
        if exc.code in voidware_auth.FRESH_GRANT_CODES:
            _clear_slot_grant(slot)
        raise ConfigError(f"Voidware auth {exc.code}: {exc}") from exc
    if not secret_info.get("secret") and not _env_first(SLOT_ENV_KEYS[slot]):
        raise ConfigError("Selected Voidware credential did not return a secret.")
    meta = _safe_provider_credential_meta(credential_meta or {"name": name, **(ref or {})})
    grant = secret_info.get("grant") if isinstance(secret_info.get("grant"), dict) else {}
    data = _load_config_file()
    section = dict(_load_slot_section(data, slot))
    prefix = _slot_field_prefix(slot)
    section[f"{prefix}_name"] = name
    section[f"{prefix}_ref"] = voidware_auth.serialize_credential_ref(ref) if ref else ""
    section[f"{prefix}_meta"] = meta
    section[f"{prefix}_grant"] = grant
    data[_slot_section_key(slot)] = section
    _persist_config(data)
    return _slot_selection_from_section(slot, section)


def _clear_slot_grant(slot: str) -> None:
    data = _load_config_file()
    section = dict(_load_slot_section(data, slot))
    prefix = _slot_field_prefix(slot)
    section[f"{prefix}_grant"] = {}
    data[_slot_section_key(slot)] = section
    _persist_config(data)


def clear_credential_slot_selection(slot: str) -> None:
    if slot not in CREDENTIAL_SLOTS:
        raise ConfigError(f"Unknown credential slot: {slot}")
    data = _load_config_file()
    section = dict(_load_slot_section(data, slot))
    prefix = _slot_field_prefix(slot)
    section[f"{prefix}_name"] = ""
    section[f"{prefix}_ref"] = ""
    section[f"{prefix}_meta"] = {}
    section[f"{prefix}_grant"] = {}
    data[_slot_section_key(slot)] = section
    _persist_config(data)


def save_slot_api_key(slot: str, api_key: str) -> CredentialSlotConfig:
    secret = str(api_key or "").strip()
    if not secret:
        raise ConfigError("api_key is required")
    default_name = SLOT_DEFAULT_SECRET_NAMES[slot]
    labels = {
        "provider": "LLM-Dash Agent Provider",
        "exa": "LLM-Dash Exa",
        "llmstats": "LLM-Dash LLM Stats",
        "aa": "LLM-Dash Artificial Analysis",
    }
    env_names = {
        "provider": PROVIDER_KEY_NAME,
        "exa": EXA_KEY_NAME,
        "llmstats": LLMSTATS_KEY_NAME,
        "aa": AA_KEY_NAME,
    }
    _save_secret(
        default_name,
        env_names[slot],
        secret,
        metadata={"label": labels[slot], "envVar": env_names[slot]},
        custom={"app": APP_NAME, "kind": SLOT_MANAGED_KINDS[slot]},
    )
    return select_credential_slot(
        slot,
        credential_name=default_name,
        credential_meta={"name": default_name, "label": labels[slot]},
    )


def update_slot_api_key(
    slot: str,
    api_key: str,
    *,
    external_mutation: bool = False,
    require_fresh_grant: bool = False,
) -> CredentialSlotConfig:
    selection, managed = _require_external_mutation_allowed(
        slot,
        external_mutation=external_mutation,
        require_fresh_grant=require_fresh_grant,
    )
    secret = str(api_key or "").strip()
    if not secret:
        raise ConfigError("api_key is required")
    name = selection.credential_name or SLOT_DEFAULT_SECRET_NAMES[slot]
    ref = _resolved_mutation_ref(selection.credential_ref)
    voidware_auth.write_secret(
        name,
        secret,
        require_fresh_grant=require_fresh_grant or not managed,
        credential_ref=ref or None,
    )
    return select_credential_slot(slot, credential_name=name, credential_ref=ref or None, credential_meta=selection.credential_meta)


def delete_slot_credential(
    slot: str,
    *,
    external_mutation: bool = False,
    require_fresh_grant: bool = False,
) -> None:
    selection, managed = _require_external_mutation_allowed(
        slot,
        external_mutation=external_mutation,
        require_fresh_grant=require_fresh_grant,
    )
    name = selection.credential_name or SLOT_DEFAULT_SECRET_NAMES[slot]
    ref = _resolved_mutation_ref(selection.credential_ref)
    voidware_auth.delete_secret(
        name,
        require_fresh_grant=require_fresh_grant or not managed,
        credential_ref=ref or None,
    )
    for key_name in SLOT_KEY_NAMES[slot]:
        _keyring_delete(key_name)
    clear_credential_slot_selection(slot)


def build_auth_headers(bundle: ProviderBundle) -> dict[str, str]:
    headers = dict(bundle.config.request_headers or {})
    if not any(is_sensitive_header(name) for name in headers):
        headers["Authorization"] = f"Bearer {bundle.secrets.api_key}"
    return headers


def public_provider_state() -> dict[str, Any]:
    config = load_provider_config()
    exa_slot = load_credential_slot("exa")
    llmstats_slot = load_credential_slot("llmstats")
    aa_slot = load_credential_slot("aa")
    provider_auth = _credential_source(
        PROVIDER_API_KEY_ENVS,
        PROVIDER_KEY_NAMES,
        voidware_auth.PROVIDER_SECRET_NAME,
        config.provider_credential_name,
        config.provider_credential_ref,
        config.provider_credential_grant,
    )
    exa_auth = _credential_source(
        EXA_API_KEY_ENVS,
        EXA_KEY_NAME,
        voidware_auth.EXA_SECRET_NAME,
        exa_slot.credential_name,
        exa_slot.credential_ref,
        exa_slot.credential_grant,
    )
    llmstats_auth = _credential_source(
        LLMSTATS_API_KEY_ENVS,
        LLMSTATS_KEY_NAME,
        voidware_auth.LLMSTATS_SECRET_NAME,
        llmstats_slot.credential_name,
        llmstats_slot.credential_ref,
        llmstats_slot.credential_grant,
    )
    aa_auth = _credential_source(
        AA_API_KEY_ENVS,
        AA_KEY_NAME,
        voidware_auth.AA_SECRET_NAME,
        aa_slot.credential_name,
        aa_slot.credential_ref,
        aa_slot.credential_grant,
    )
    has_provider = bool(config.base_url and config.default_model and provider_auth.get("configured"))
    bundle = ProviderBundle(config=config, secrets=ProviderSecrets(api_key=""))
    return {
        "has_provider": has_provider,
        "base_url": config.base_url,
        "models_override_url": config.models_override_url,
        "chat_endpoint": bundle.chat_endpoint,
        "models_endpoint": bundle.models_endpoint,
        "default_model": config.default_model,
        "backup_model": config.backup_model,
        "endpoint_mode": config.endpoint_mode,
        "provider_credential_name": config.provider_credential_name,
        "provider_credential_ref": voidware_auth.safe_credential_ref(config.provider_credential_ref),
        "provider_credential_meta": config.provider_credential_meta or {},
        "provider_credential_grant": config.provider_credential_grant or {},
        "exa_configured": bool(exa_auth.get("configured")),
        "llmstats_configured": bool(llmstats_auth.get("configured")),
        "aa_configured": bool(aa_auth.get("configured")),
        "credential_slots": {
            "provider": {
                "name": config.provider_credential_name,
                "ref": voidware_auth.safe_credential_ref(config.provider_credential_ref),
                "meta": config.provider_credential_meta or {},
                "grant": config.provider_credential_grant or {},
                "grant_status": provider_auth.get("grant_status") or voidware_auth.grant_renewal_status(config.provider_credential_grant),
                "managed_by_llmdash": provider_auth.get("managed_by_llmdash", False),
            },
            "exa": {
                "name": exa_slot.credential_name,
                "ref": voidware_auth.safe_credential_ref(exa_slot.credential_ref),
                "meta": exa_slot.credential_meta or {},
                "grant": exa_slot.credential_grant or {},
                "grant_status": exa_auth.get("grant_status") or voidware_auth.grant_renewal_status(exa_slot.credential_grant),
                "managed_by_llmdash": exa_auth.get("managed_by_llmdash", False),
            },
            "llmstats": {
                "name": llmstats_slot.credential_name,
                "ref": voidware_auth.safe_credential_ref(llmstats_slot.credential_ref),
                "meta": llmstats_slot.credential_meta or {},
                "grant": llmstats_slot.credential_grant or {},
                "grant_status": llmstats_auth.get("grant_status") or voidware_auth.grant_renewal_status(llmstats_slot.credential_grant),
                "managed_by_llmdash": llmstats_auth.get("managed_by_llmdash", False),
            },
            "aa": {
                "name": aa_slot.credential_name,
                "ref": voidware_auth.safe_credential_ref(aa_slot.credential_ref),
                "meta": aa_slot.credential_meta or {},
                "grant": aa_slot.credential_grant or {},
                "grant_status": aa_auth.get("grant_status") or voidware_auth.grant_renewal_status(aa_slot.credential_grant),
                "managed_by_llmdash": aa_auth.get("managed_by_llmdash", False),
            },
        },
        "auth": {
            "precedence": ["env", "voidware-provider", "voidware-broker", "voidware-keystore", "keyring-legacy"],
            "broker": voidware_auth.broker_status(),
            "provider": provider_auth,
            "exa": exa_auth,
            "llmstats": llmstats_auth,
            "aa": aa_auth,
        },
    }


def load_provider_config() -> ProviderConfig:
    data = _load_config_file()
    provider = data.get("provider", data)
    if not isinstance(provider, dict):
        provider = {}

    base_url = _env_first(PROVIDER_BASE_URL_ENVS) or str(provider.get("base_url") or "")
    models_override_url = _env_first(MODELS_OVERRIDE_URL_ENVS) or str(provider.get("models_override_url") or "")
    default_model = _env_first(DEFAULT_MODEL_ENVS) or str(provider.get("default_model") or "")
    backup_model = _env_first(BACKUP_MODEL_ENVS) or str(provider.get("backup_model") or "")
    endpoint_mode = normalize_endpoint_mode(os.environ.get(ENDPOINT_MODE_ENV) or provider.get("endpoint_mode"))
    request_headers = provider.get("request_headers") or {}
    provider_credential_name = str(provider.get("provider_credential_name") or "").strip()
    provider_credential_ref = str(provider.get("provider_credential_ref") or "").strip()
    provider_credential_meta = _safe_provider_credential_meta(provider.get("provider_credential_meta"))
    provider_credential_grant = provider.get("provider_credential_grant")
    if os.environ.get(REQUEST_HEADERS_ENV):
        request_headers = os.environ[REQUEST_HEADERS_ENV]

    return ProviderConfig(
        base_url=normalize_base_url(base_url, allow_v1=endpoint_mode == ENDPOINT_MODE_ROOT) if base_url else "",
        models_override_url=normalize_base_url(
            models_override_url,
            field="models_override_url",
            allow_v1=endpoint_mode == ENDPOINT_MODE_ROOT,
        )
        if models_override_url
        else "",
        default_model=normalize_provider_model_id(base_url, default_model),
        backup_model=normalize_provider_model_id(base_url, backup_model),
        endpoint_mode=endpoint_mode,
        request_headers=_normalize_header_map(request_headers),
        provider_credential_name=provider_credential_name,
        provider_credential_ref=provider_credential_ref,
        provider_credential_meta=provider_credential_meta,
        provider_credential_grant=provider_credential_grant if isinstance(provider_credential_grant, dict) else {},
    )


def _save_secret(
    broker_name: str,
    keyring_name: str,
    secret: str,
    *,
    metadata: dict[str, Any],
    custom: dict[str, Any],
) -> None:
    try:
        voidware_auth.write_secret(
            broker_name,
            secret,
            metadata=metadata,
            custom=custom,
        )
        return
    except voidware_auth.VoidwareAuthError as exc:
        raise ConfigError(f"Voidware auth {exc.code}: {exc}") from exc


def _remove_secret(
    broker_name: str,
    keyring_names: tuple[str, ...],
    *,
    credential_ref: str | dict[str, Any] | None = None,
) -> None:
    ref = _resolved_mutation_ref(credential_ref)
    try:
        voidware_auth.delete_secret(broker_name, credential_ref=ref or None)
    except voidware_auth.VoidwareAuthError as exc:
        if exc.code not in SECRET_REMOVE_FALLBACK_CODES:
            raise ConfigError(f"Voidware auth {exc.code}: {exc}") from exc

    for name in keyring_names:
        _keyring_delete(name)


def load_provider_bundle() -> ProviderBundle:
    config = load_provider_config()
    return ProviderBundle(
        config=config,
        secrets=ProviderSecrets(api_key=_read_secret(
            PROVIDER_API_KEY_ENVS,
            PROVIDER_KEY_NAMES,
            voidware_auth.PROVIDER_SECRET_NAME,
            config.provider_credential_name,
            config.provider_credential_ref,
        )),
    )


def save_provider(
    *,
    base_url: str,
    api_key: str | None = None,
    models_override_url: str = "",
    default_model: str = "",
    backup_model: str = "",
    endpoint_mode: str = ENDPOINT_MODE_APPEND_V1,
    request_headers: dict[str, str] | None = None,
    provider_credential_name: str | None = None,
    provider_credential_ref: str | dict[str, Any] | None = None,
    provider_credential_meta: dict[str, Any] | None = None,
) -> ProviderBundle:
    current = load_provider_config()
    mode = normalize_endpoint_mode(endpoint_mode)
    selected_name = current.provider_credential_name if provider_credential_name is None else str(provider_credential_name or "").strip()
    selected_ref = current.provider_credential_ref if provider_credential_ref is None else voidware_auth.serialize_credential_ref(provider_credential_ref)
    selected_meta = current.provider_credential_meta or {}
    selected_grant = current.provider_credential_grant or {}
    resolved_secret = str(api_key or "").strip()
    if api_key:
        selected_name = ""
        selected_ref = ""
        selected_meta = {}
        selected_grant = {}
    elif selected_name or selected_ref:
        try:
            secret_info = voidware_auth.read_secret_with_grant(
                selected_name,
                credential_ref=selected_ref or None,
            )
        except voidware_auth.VoidwareAuthError as exc:
            if exc.code in voidware_auth.FRESH_GRANT_CODES:
                selected_grant = {}
            raise ConfigError(f"Voidware auth {exc.code}: {exc}") from exc
        if not secret_info.get("secret"):
            raise ConfigError("Selected Voidware credential did not return a secret.")
        resolved_secret = str(secret_info.get("secret") or "")
        selected_meta = _safe_provider_credential_meta({"name": selected_name, **(provider_credential_meta or selected_meta)})
        selected_grant = secret_info.get("grant") if isinstance(secret_info.get("grant"), dict) else {}
    normalized = ProviderConfig(
        base_url=normalize_base_url(base_url, allow_v1=mode == ENDPOINT_MODE_ROOT),
        models_override_url=normalize_base_url(
            models_override_url,
            field="models_override_url",
            allow_v1=mode == ENDPOINT_MODE_ROOT,
        )
        if models_override_url
        else "",
        default_model=normalize_provider_model_id(base_url, default_model),
        backup_model=normalize_provider_model_id(base_url, backup_model),
        endpoint_mode=mode,
        request_headers=_normalize_header_map(request_headers or {}),
        provider_credential_name=selected_name,
        provider_credential_ref=selected_ref,
        provider_credential_meta=selected_meta,
        provider_credential_grant=selected_grant,
    )
    if api_key:
        save_provider_api_key(api_key)

    data = _load_config_file()
    data["version"] = CONFIG_VERSION
    data["app"] = APP_NAME
    data["provider"] = {
        "base_url": normalized.base_url,
        "models_override_url": normalized.models_override_url,
        "default_model": normalized.default_model,
        "backup_model": normalized.backup_model,
        "endpoint_mode": normalized.endpoint_mode,
        "request_headers": normalized.request_headers or {},
        "provider_credential_name": normalized.provider_credential_name,
        "provider_credential_ref": normalized.provider_credential_ref,
        "provider_credential_meta": normalized.provider_credential_meta or {},
        "provider_credential_grant": normalized.provider_credential_grant or {},
    }
    _atomic_write_json(config_path(), data)
    return ProviderBundle(config=normalized, secrets=ProviderSecrets(api_key=resolved_secret))


def save_provider_api_key(api_key: str) -> None:
    secret = str(api_key or "").strip()
    if not secret:
        raise ConfigError("api_key is required")
    _save_secret(
        voidware_auth.PROVIDER_SECRET_NAME,
        PROVIDER_KEY_NAME,
        secret,
        metadata={"label": "LLM-Dash Agent Provider", "envVar": PROVIDER_KEY_NAME},
        custom={"app": APP_NAME, "kind": "agent-provider"},
    )


def load_exa_api_key() -> str:
    slot = load_credential_slot("exa")
    return _read_secret(
        EXA_API_KEY_ENVS,
        EXA_KEY_NAME,
        voidware_auth.EXA_SECRET_NAME,
        slot.credential_name,
        slot.credential_ref,
    )


def save_exa_api_key(api_key: str) -> None:
    save_slot_api_key("exa", api_key)


def remove_exa_api_key() -> None:
    clear_credential_slot_selection("exa")
    _remove_secret(voidware_auth.EXA_SECRET_NAME, (EXA_KEY_NAME,))


def load_llmstats_api_key() -> str:
    slot = load_credential_slot("llmstats")
    return _read_secret(
        LLMSTATS_API_KEY_ENVS,
        LLMSTATS_KEY_NAME,
        voidware_auth.LLMSTATS_SECRET_NAME,
        slot.credential_name,
        slot.credential_ref,
    )


def save_llmstats_api_key(api_key: str) -> None:
    save_slot_api_key("llmstats", api_key)


def remove_llmstats_api_key() -> None:
    clear_credential_slot_selection("llmstats")
    _remove_secret(voidware_auth.LLMSTATS_SECRET_NAME, (LLMSTATS_KEY_NAME,))


def load_aa_api_key() -> str:
    slot = load_credential_slot("aa")
    return _read_secret(
        AA_API_KEY_ENVS,
        AA_KEY_NAME,
        voidware_auth.AA_SECRET_NAME,
        slot.credential_name,
        slot.credential_ref,
    )


def save_aa_api_key(api_key: str) -> None:
    save_slot_api_key("aa", api_key)


def remove_aa_api_key() -> None:
    clear_credential_slot_selection("aa")
    _remove_secret(voidware_auth.AA_SECRET_NAME, (AA_KEY_NAME,))


def remove_provider_api_key() -> None:
    config = load_provider_config()
    _remove_secret(
        config.provider_credential_name or voidware_auth.PROVIDER_SECRET_NAME,
        PROVIDER_KEY_NAMES,
        credential_ref=config.provider_credential_ref or None,
    )
