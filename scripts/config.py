#!/usr/bin/env python3
"""LLM-Dash Agent Provider config and credential helpers."""

from __future__ import annotations

import json
import os
import re
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
SECRET_FALLBACK_CODES = {"broker_unavailable", "broker_timeout", "cli_unavailable"}


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
    provider_credential_meta: dict[str, Any] | None = None
    provider_credential_grant: dict[str, Any] | None = None


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
        return data
    if APP_NAME in data and isinstance(data[APP_NAME], dict):
        return data[APP_NAME]
    return data


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


def _read_broker_secret(name: str) -> str:
    try:
        return voidware_auth.read_secret(name)
    except voidware_auth.VoidwareAuthError:
        return ""


def _read_secret(
    envs: tuple[str, ...],
    key_name: str | tuple[str, ...],
    broker_name: str | None = None,
    selected_name: str | None = None,
) -> str:
    key_names = (key_name,) if isinstance(key_name, str) else key_name
    env_secret = _env_first(envs)
    if env_secret:
        return env_secret
    if selected_name:
        selected_secret = _read_broker_secret(selected_name)
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
    selected_grant: dict[str, Any] | None = None,
) -> dict[str, Any]:
    key_names = (key_name,) if isinstance(key_name, str) else key_name
    if _env_first(envs):
        return {"configured": True, "source": "env", "legacy_migration_available": False}
    discovered_names = set()
    try:
        discovered_names = {
            str(item.get("name"))
            for item in voidware_auth.discover_provider_credentials(reusable_only=False)
            if item.get("name") and item.get("hasSecret", item.get("has_secret", False))
        }
    except Exception:
        discovered_names = set()
    if selected_name:
        return {
            "configured": selected_name in discovered_names or bool(selected_grant),
            "source": "voidware-provider",
            "name": selected_name,
            "grant": selected_grant or {},
            "legacy_migration_available": any(_legacy_secret(name) for name in key_names),
        }
    for name in [*( [broker_name] if broker_name else [] ), *key_names]:
        if name and name in discovered_names:
            return {
                "configured": True,
                "source": "voidware-broker",
                "name": name,
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
    return {
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


def build_auth_headers(bundle: ProviderBundle) -> dict[str, str]:
    headers = dict(bundle.config.request_headers or {})
    if not any(is_sensitive_header(name) for name in headers):
        headers["Authorization"] = f"Bearer {bundle.secrets.api_key}"
    return headers


def public_provider_state() -> dict[str, Any]:
    config = load_provider_config()
    provider_auth = _credential_source(
        PROVIDER_API_KEY_ENVS,
        PROVIDER_KEY_NAMES,
        voidware_auth.PROVIDER_SECRET_NAME,
        config.provider_credential_name,
        config.provider_credential_grant,
    )
    exa_auth = _credential_source(EXA_API_KEY_ENVS, EXA_KEY_NAME, voidware_auth.EXA_SECRET_NAME)
    llmstats_auth = _credential_source(LLMSTATS_API_KEY_ENVS, LLMSTATS_KEY_NAME, voidware_auth.LLMSTATS_SECRET_NAME)
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
        "provider_credential_meta": config.provider_credential_meta or {},
        "provider_credential_grant": config.provider_credential_grant or {},
        "exa_configured": bool(exa_auth.get("configured")),
        "llmstats_configured": bool(llmstats_auth.get("configured")),
        "auth": {
            "precedence": ["env", "voidware-provider", "voidware-broker", "voidware-keystore", "keyring-legacy"],
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
    provider_credential_name = str(provider.get("provider_credential_name") or "").strip()
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
        default_model=default_model.strip(),
        backup_model=backup_model.strip(),
        endpoint_mode=endpoint_mode,
        request_headers=_normalize_header_map(request_headers),
        provider_credential_name=provider_credential_name,
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
        if exc.code not in SECRET_FALLBACK_CODES:
            raise ConfigError(f"Voidware auth {exc.code}: {exc}") from exc
        if not _keyring_set(keyring_name, secret):
            raise ConfigError(f"Voidware auth {exc.code}: {exc}; secure local fallback failed.") from exc


def _remove_secret(broker_name: str, keyring_names: tuple[str, ...]) -> None:
    try:
        voidware_auth.delete_secret(broker_name)
    except voidware_auth.VoidwareAuthError as exc:
        if exc.code not in SECRET_FALLBACK_CODES:
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
    provider_credential_meta: dict[str, Any] | None = None,
) -> ProviderBundle:
    current = load_provider_config()
    mode = normalize_endpoint_mode(endpoint_mode)
    selected_name = current.provider_credential_name if provider_credential_name is None else str(provider_credential_name or "").strip()
    selected_meta = current.provider_credential_meta or {}
    selected_grant = current.provider_credential_grant or {}
    resolved_secret = str(api_key or "").strip()
    if api_key:
        selected_name = ""
        selected_meta = {}
        selected_grant = {}
    elif selected_name:
        try:
            secret_info = voidware_auth.read_secret_with_grant(selected_name)
        except voidware_auth.VoidwareAuthError as exc:
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
        default_model=str(default_model or "").strip(),
        backup_model=str(backup_model or "").strip(),
        endpoint_mode=mode,
        request_headers=_normalize_header_map(request_headers or {}),
        provider_credential_name=selected_name,
        provider_credential_meta=selected_meta,
        provider_credential_grant=selected_grant,
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
        "provider_credential_name": normalized.provider_credential_name,
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
    return _read_secret(EXA_API_KEY_ENVS, EXA_KEY_NAME, voidware_auth.EXA_SECRET_NAME)


def save_exa_api_key(api_key: str) -> None:
    secret = str(api_key or "").strip()
    if not secret:
        raise ConfigError("api_key is required")
    _save_secret(
        voidware_auth.EXA_SECRET_NAME,
        EXA_KEY_NAME,
        secret,
        metadata={"label": "LLM-Dash Exa", "envVar": EXA_KEY_NAME},
        custom={"app": APP_NAME, "kind": "exa"},
    )


def remove_exa_api_key() -> None:
    _remove_secret(voidware_auth.EXA_SECRET_NAME, (EXA_KEY_NAME,))


def load_llmstats_api_key() -> str:
    return _read_secret(LLMSTATS_API_KEY_ENVS, LLMSTATS_KEY_NAME, voidware_auth.LLMSTATS_SECRET_NAME)


def save_llmstats_api_key(api_key: str) -> None:
    secret = str(api_key or "").strip()
    if not secret:
        raise ConfigError("api_key is required")
    _save_secret(
        voidware_auth.LLMSTATS_SECRET_NAME,
        LLMSTATS_KEY_NAME,
        secret,
        metadata={"label": "LLM-Dash LLM Stats", "envVar": LLMSTATS_KEY_NAME},
        custom={"app": APP_NAME, "kind": "llmstats"},
    )


def remove_llmstats_api_key() -> None:
    _remove_secret(voidware_auth.LLMSTATS_SECRET_NAME, (LLMSTATS_KEY_NAME,))


def remove_provider_api_key() -> None:
    _remove_secret(voidware_auth.PROVIDER_SECRET_NAME, PROVIDER_KEY_NAMES)
