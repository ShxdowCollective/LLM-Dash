#!/usr/bin/env python3
"""LLM-Dash Agent Provider config and credential helpers."""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

try:
    from scripts import voidware_auth
except ModuleNotFoundError:
    import voidware_auth  # type: ignore

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

SENSITIVE_HEADER_PARTS = ("authorization", "api-key", "apikey", "x-api-key", "token", "secret", "key")
ENDPOINT_MODE_APPEND_V1 = "append_v1"
ENDPOINT_MODE_ROOT = "root"
ENDPOINT_MODES = {ENDPOINT_MODE_APPEND_V1, ENDPOINT_MODE_ROOT}


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


def _read_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError as exc:
        raise ConfigError(f"Invalid JSON in {path}: {exc}") from exc


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
        return data
    if APP_NAME in data and isinstance(data[APP_NAME], dict):
        return data[APP_NAME]
    return data


def _load_auth_file() -> dict[str, Any]:
    data = _read_json(auth_path())
    credentials = data.get("credentials")
    return credentials if isinstance(credentials, dict) else {}


def _credential_from_auth_file(name: str) -> str:
    item = _load_auth_file().get(name)
    if isinstance(item, dict):
        return str(item.get("secret") or "")
    if isinstance(item, str):
        return item
    return ""


def _keyring_get(name: str) -> str:
    try:
        import keyring
    except Exception:
        return ""
    try:
        return keyring.get_password(KEYRING_SERVICE, name) or ""
    except Exception:
        return ""


def _keyring_set_verified(name: str, secret: str) -> bool:
    try:
        import keyring
    except Exception:
        return False
    try:
        keyring.set_password(KEYRING_SERVICE, name, secret)
        return keyring.get_password(KEYRING_SERVICE, name) == secret
    except Exception:
        return False


def _delete_keyring_secret(name: str) -> bool:
    try:
        import keyring
    except Exception:
        return False
    try:
        keyring.delete_password(KEYRING_SERVICE, name)
        return True
    except Exception:
        return False


def _delete_auth_file_secret(name: str) -> None:
    data = _read_json(auth_path()) or {"version": 2, "credentials": {}}
    credentials = data.get("credentials", {})
    if name in credentials:
        del credentials[name]
    data["credentials"] = credentials
    _atomic_write_json(auth_path(), data)


def _save_auth_file_secret(name: str, secret: str, meta: dict[str, Any] | None = None) -> None:
    data = _read_json(auth_path()) or {"version": 2, "credentials": {}}
    data["version"] = 2
    credentials = data.setdefault("credentials", {})
    item: dict[str, Any] = {"name": name, "secret": secret}
    if meta:
        item["meta"] = meta
    credentials[name] = item
    _atomic_write_json(auth_path(), data)


def _legacy_secret(name: str) -> str:
    return _keyring_get(name) or _credential_from_auth_file(name)


def _read_broker_secret(name: str) -> str:
    try:
        return voidware_auth.read_secret(name)
    except voidware_auth.VoidwareAuthError:
        return ""


def _read_secret(envs: tuple[str, ...], key_name: str | tuple[str, ...], broker_name: str | None = None) -> str:
    key_names = (key_name,) if isinstance(key_name, str) else key_name
    candidates = [_env_first(envs)]
    if broker_name:
        candidates.append(_read_broker_secret(broker_name))
    candidates.extend(_legacy_secret(name) for name in key_names)
    for secret in candidates:
        if secret:
            return secret
    return ""


def _credential_source(envs: tuple[str, ...], key_name: str | tuple[str, ...], broker_name: str | None = None) -> dict[str, Any]:
    key_names = (key_name,) if isinstance(key_name, str) else key_name
    if _env_first(envs):
        return {"configured": True, "source": "env", "legacy_migration_available": False}
    if broker_name and _read_broker_secret(broker_name):
        return {"configured": True, "source": "voidware-broker", "legacy_migration_available": any(_legacy_secret(name) for name in key_names)}
    legacy_source = ""
    for name in key_names:
        if _keyring_get(name):
            legacy_source = "keyring-legacy"
            break
        if _credential_from_auth_file(name):
            legacy_source = "auth-file-legacy"
            break
    return {
        "configured": bool(legacy_source),
        "source": legacy_source or "missing",
        "legacy_migration_available": bool(legacy_source),
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


def build_auth_headers(bundle: ProviderBundle) -> dict[str, str]:
    headers = dict(bundle.config.request_headers or {})
    if not any(is_sensitive_header(name) for name in headers):
        headers["Authorization"] = f"Bearer {bundle.secrets.api_key}"
    return headers


def public_provider_state() -> dict[str, Any]:
    bundle = load_provider_bundle()
    provider_auth = _credential_source(PROVIDER_API_KEY_ENVS, PROVIDER_KEY_NAMES, voidware_auth.PROVIDER_SECRET_NAME)
    exa_auth = _credential_source(EXA_API_KEY_ENVS, EXA_KEY_NAME, voidware_auth.EXA_SECRET_NAME)
    llmstats_auth = _credential_source(LLMSTATS_API_KEY_ENVS, LLMSTATS_KEY_NAME, voidware_auth.LLMSTATS_SECRET_NAME)
    return {
        "has_provider": bundle.has_provider,
        "base_url": bundle.config.base_url,
        "models_override_url": bundle.config.models_override_url,
        "chat_endpoint": bundle.chat_endpoint,
        "models_endpoint": bundle.models_endpoint,
        "default_model": bundle.config.default_model,
        "backup_model": bundle.config.backup_model,
        "endpoint_mode": bundle.config.endpoint_mode,
        "exa_configured": bool(load_exa_api_key()),
        "llmstats_configured": bool(load_llmstats_api_key()),
        "auth": {
            "precedence": ["env", "voidware-broker", "keyring-legacy", "auth-file-legacy"],
            "broker": voidware_auth.broker_status(),
            "provider": provider_auth,
            "exa": exa_auth,
            "llmstats": llmstats_auth,
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
        default_model=default_model.strip(),
        backup_model=backup_model.strip(),
        endpoint_mode=endpoint_mode,
        request_headers=_normalize_header_map(request_headers),
    )


def load_provider_bundle() -> ProviderBundle:
    return ProviderBundle(
        config=load_provider_config(),
        secrets=ProviderSecrets(api_key=_read_secret(PROVIDER_API_KEY_ENVS, PROVIDER_KEY_NAMES, voidware_auth.PROVIDER_SECRET_NAME)),
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
) -> ProviderBundle:
    mode = normalize_endpoint_mode(endpoint_mode)
    normalized = ProviderConfig(
        base_url=normalize_base_url(base_url, allow_v1=mode == ENDPOINT_MODE_ROOT),
        models_override_url=normalize_base_url(
            models_override_url,
            field="models_override_url",
            allow_v1=mode == ENDPOINT_MODE_ROOT,
        )
        if models_override_url
        else "",
        default_model=str(default_model or "").strip(),
        backup_model=str(backup_model or "").strip(),
        endpoint_mode=mode,
        request_headers=_normalize_header_map(request_headers or {}),
    )
    if api_key:
        save_provider_api_key(api_key)

    data = _load_config_file()
    data["version"] = 1
    data["app"] = APP_NAME
    data["provider"] = {
        "base_url": normalized.base_url,
        "models_override_url": normalized.models_override_url,
        "default_model": normalized.default_model,
        "backup_model": normalized.backup_model,
        "endpoint_mode": normalized.endpoint_mode,
        "request_headers": normalized.request_headers or {},
    }
    _atomic_write_json(config_path(), data)
    return load_provider_bundle()


def save_provider_api_key(api_key: str) -> None:
    secret = str(api_key or "").strip()
    if not secret:
        raise ConfigError("api_key is required")
    try:
        voidware_auth.write_secret(
            voidware_auth.PROVIDER_SECRET_NAME,
            secret,
            metadata={"label": "LLM-Dash Agent Provider", "envVar": PROVIDER_KEY_NAME},
            custom={"app": APP_NAME, "kind": "agent-provider"},
        )
    except voidware_auth.VoidwareAuthError as exc:
        raise ConfigError(f"Voidware auth {exc.code}: {exc}") from exc


def load_exa_api_key() -> str:
    return _read_secret(EXA_API_KEY_ENVS, EXA_KEY_NAME, voidware_auth.EXA_SECRET_NAME)


def save_exa_api_key(api_key: str) -> None:
    secret = str(api_key or "").strip()
    if not secret:
        raise ConfigError("api_key is required")
    try:
        voidware_auth.write_secret(
            voidware_auth.EXA_SECRET_NAME,
            secret,
            metadata={"label": "LLM-Dash Exa", "envVar": EXA_KEY_NAME},
            custom={"app": APP_NAME, "kind": "exa"},
        )
    except voidware_auth.VoidwareAuthError as exc:
        raise ConfigError(f"Voidware auth {exc.code}: {exc}") from exc


def remove_exa_api_key() -> None:
    try:
        voidware_auth.delete_secret(voidware_auth.EXA_SECRET_NAME)
    except voidware_auth.VoidwareAuthError as exc:
        raise ConfigError(f"Voidware auth {exc.code}: {exc}") from exc


def load_llmstats_api_key() -> str:
    return _read_secret(LLMSTATS_API_KEY_ENVS, LLMSTATS_KEY_NAME, voidware_auth.LLMSTATS_SECRET_NAME)


def save_llmstats_api_key(api_key: str) -> None:
    secret = str(api_key or "").strip()
    if not secret:
        raise ConfigError("api_key is required")
    try:
        voidware_auth.write_secret(
            voidware_auth.LLMSTATS_SECRET_NAME,
            secret,
            metadata={"label": "LLM-Dash LLM Stats", "envVar": LLMSTATS_KEY_NAME},
            custom={"app": APP_NAME, "kind": "llmstats"},
        )
    except voidware_auth.VoidwareAuthError as exc:
        raise ConfigError(f"Voidware auth {exc.code}: {exc}") from exc


def remove_llmstats_api_key() -> None:
    try:
        voidware_auth.delete_secret(voidware_auth.LLMSTATS_SECRET_NAME)
    except voidware_auth.VoidwareAuthError as exc:
        raise ConfigError(f"Voidware auth {exc.code}: {exc}") from exc


def remove_provider_api_key() -> None:
    try:
        voidware_auth.delete_secret(voidware_auth.PROVIDER_SECRET_NAME)
    except voidware_auth.VoidwareAuthError as exc:
        raise ConfigError(f"Voidware auth {exc.code}: {exc}") from exc
