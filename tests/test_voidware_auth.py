from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts import config, voidware_auth  # noqa: E402


ENV_KEYS = {
    config.SHXDOW_ROOT_ENV,
    *config.PROVIDER_BASE_URL_ENVS,
    *config.PROVIDER_API_KEY_ENVS,
    *config.DEFAULT_MODEL_ENVS,
    *config.BACKUP_MODEL_ENVS,
    *config.MODELS_OVERRIDE_URL_ENVS,
    config.REQUEST_HEADERS_ENV,
    config.ENDPOINT_MODE_ENV,
}


class VoidwareAuthTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        env = {key: "" for key in ENV_KEYS}
        env[config.SHXDOW_ROOT_ENV] = self.tmp.name
        patcher = patch.dict(os.environ, env, clear=False)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_provider_discovery_filters_and_redacts_reusable_http_credentials(self) -> None:
        raw_candidates = [
            {
                "name": "zeta",
                "label": "Zeta",
                "hasSecret": False,
                "baseURL": "https://missing-secret.example",
            },
            {
                "name": "alpha",
                "label": "Alpha",
                "source": "voidware",
                "sources": ["auth-file", "keyring"],
                "hasSecret": True,
                "reusability": "reusable",
                "providerFamily": "openai",
                "apiFormat": "openai",
                "baseURL": "https://api.alpha.example/v1",
                "modelsURL": "https://api.alpha.example/v1/models",
                "chatURL": "https://api.alpha.example/v1/chat/completions",
                "safeCustom": {
                    "region": "iad",
                    "api_key": "sk-should-not-leak",
                    "Authorization": "Bearer sk-should-not-leak",
                },
                "secret": "sk-top-level-should-not-leak",
            },
            {
                "name": "file-provider",
                "label": "File Provider",
                "hasSecret": True,
                "baseURL": "file:///tmp/not-http",
            },
        ]

        with patch.object(config.voidware_auth, "discover_provider_credentials", return_value=raw_candidates):
            discovered = config.discover_provider_credentials()

        self.assertEqual([item["name"] for item in discovered["credentials"]], ["alpha"])
        candidate = discovered["credentials"][0]
        self.assertEqual(candidate["endpoint_mode"], config.ENDPOINT_MODE_ROOT)
        self.assertEqual(candidate["safe_custom"], {"region": "iad"})
        self.assertNotIn("sk-should-not-leak", json.dumps(discovered))
        self.assertNotIn("sk-top-level-should-not-leak", json.dumps(discovered))

    def test_selected_provider_persistence_stores_metadata_and_reads_secret_through_broker(self) -> None:
        grant = {
            "expiresAt": "2099-01-01T00:00:00Z",
            "renewalWindowStartsAt": "2098-10-01T00:00:00Z",
            "renewalRecommended": False,
        }

        with (
            patch.object(config.voidware_auth, "read_secret_with_grant", return_value={"secret": "sk-selected", "grant": grant}),
            patch.object(config.voidware_auth, "read_secret", return_value="sk-selected"),
        ):
            bundle = config.save_provider(
                base_url="https://api.alpha.example",
                default_model="alpha-chat",
                endpoint_mode=config.ENDPOINT_MODE_APPEND_V1,
                provider_credential_name="alpha",
                provider_credential_meta={
                    "name": "alpha",
                    "label": "Alpha",
                    "baseURL": "https://api.alpha.example",
                    "safeCustom": {
                        "region": "iad",
                        "Authorization": "Bearer sk-selected",
                    },
                    "secret": "sk-selected",
                },
            )

        persisted = config.config_path().read_text(encoding="utf-8")
        provider = json.loads(persisted)["provider"]
        self.assertEqual(bundle.secrets.api_key, "sk-selected")
        self.assertEqual(provider["provider_credential_name"], "alpha")
        self.assertEqual(provider["provider_credential_grant"], grant)
        self.assertEqual(provider["provider_credential_meta"]["safeCustom"], {"region": "iad"})
        self.assertNotIn("sk-selected", persisted)

    def test_new_provider_key_falls_back_to_keyring_when_broker_is_unavailable(self) -> None:
        stored: dict[str, str] = {}

        def broker_unavailable(*args, **kwargs) -> None:
            raise voidware_auth.VoidwareAuthError("auth broker unavailable", code="broker_unavailable")

        with (
            patch.object(config.voidware_auth, "write_secret", side_effect=broker_unavailable),
            patch.object(config.voidware_auth, "read_secret", return_value=""),
            patch.object(config, "_keyring_set", side_effect=lambda name, value: stored.setdefault(name, value) is not None),
            patch.object(config, "_keyring_get", side_effect=lambda name: stored.get(name, "")),
        ):
            bundle = config.save_provider(
                base_url="https://api.alpha.example",
                api_key="sk-fallback",
                default_model="alpha-chat",
                endpoint_mode=config.ENDPOINT_MODE_APPEND_V1,
            )

        self.assertTrue(bundle.has_provider)
        self.assertEqual(bundle.secrets.api_key, "sk-fallback")
        self.assertEqual(stored[config.PROVIDER_KEY_NAME], "sk-fallback")
        self.assertNotIn("sk-fallback", config.config_path().read_text(encoding="utf-8"))

    def test_bridge_grant_uses_official_voidware_cache_namespace(self) -> None:
        self.assertEqual(voidware_auth.OFFICIAL_CLIENT_GRANT_SERVICE_NAME, "voidware-client-grants")
        self.assertEqual(voidware_auth.LEGACY_CLIENT_GRANT_SERVICE_NAME, "llm-dash-voidware-grants")

    def test_broker_request_does_not_autostart_headless_broker(self) -> None:
        calls: list[tuple[list[str], list[str]]] = []

        def fake_run_once(cmd: list[str], args: list[str], **kwargs) -> dict[str, object]:
            calls.append((cmd, args))
            return {"ok": False, "errorCode": "broker_unavailable", "error": "missing socket"}

        with (
            patch.object(voidware_auth, "resolve_cli", return_value=["node", "/opt/voidware/bin.js"]),
            patch.object(voidware_auth, "_run_once", side_effect=fake_run_once),
            patch.object(voidware_auth.subprocess, "Popen") as popen,
        ):
            payload = voidware_auth._run(["auth", "broker", "request", "auth:secret:read", "alpha", "--json"])

        self.assertFalse(payload["ok"])
        popen.assert_not_called()
        self.assertEqual(calls[0][1][:3], ["auth", "broker", "request"])

    def test_secret_read_requires_approval_capable_broker_without_cached_grant(self) -> None:
        def bridge_unavailable(*args, **kwargs) -> dict[str, object]:
            raise voidware_auth.VoidwareAuthError("bridge unavailable", code="bridge_unavailable")

        with (
            patch.object(voidware_auth._BRIDGE, "request", side_effect=bridge_unavailable),
            patch.object(voidware_auth, "_load_cached_grant", return_value={}),
            patch.object(
                voidware_auth,
                "broker_status",
                return_value={
                    "available": True,
                    "can_approve": False,
                    "approval_surface": "none",
                    "bootstrap_actions": [],
                },
            ),
        ):
            with self.assertRaises(voidware_auth.VoidwareAuthError) as ctx:
                voidware_auth.read_secret_with_grant("alpha")

        self.assertEqual(ctx.exception.code, "approval_required")

    def test_bridge_pending_approval_is_metadata_only(self) -> None:
        with patch.object(
            voidware_auth._BRIDGE,
            "request",
            return_value={
                "ok": False,
                "code": "approval_pending",
                "operationId": "op-1",
                "approval": {
                    "app": "llm-dash",
                    "target": "alpha",
                    "passwordRequired": True,
                    "allowSecretOutput": True,
                },
            },
        ):
            result = voidware_auth.request_credential_access_grant("alpha")

        self.assertTrue(result["pending"])
        self.assertEqual(result["operation_id"], "op-1")
        self.assertNotIn("grantToken", json.dumps(result))
        self.assertNotIn("secret", json.dumps(result))

    def test_v3_encrypted_auth_file_uses_broker_instead_of_plaintext_fallback(self) -> None:
        auth_file = Path(self.tmp.name) / "auth.json"
        auth_file.write_text(
            json.dumps({
                "version": 3,
                "credentials": {
                    "alpha": {
                        "encryptedSecret": "ciphertext-not-a-secret",
                        "baseURL": "https://api.alpha.example",
                    },
                },
            }),
            encoding="utf-8",
        )
        config.config_path().parent.mkdir(parents=True, exist_ok=True)
        config.config_path().write_text(
            json.dumps({
                "provider": {
                    "base_url": "https://api.alpha.example",
                    "default_model": "alpha-chat",
                    "provider_credential_name": "alpha",
                },
            }),
            encoding="utf-8",
        )

        with patch.object(config.voidware_auth, "read_secret", return_value="sk-from-broker") as read_secret:
            bundle = config.load_provider_bundle()

        read_secret.assert_called_once_with("alpha")
        self.assertTrue(bundle.has_provider)
        self.assertEqual(bundle.secrets.api_key, "sk-from-broker")

    def test_public_provider_state_shows_voidware_keystore_source(self) -> None:
        config.config_path().parent.mkdir(parents=True, exist_ok=True)
        config.config_path().write_text(
            json.dumps({
                "provider": {
                    "base_url": "",
                    "default_model": "",
                },
            }),
            encoding="utf-8",
        )

        with (
            patch.object(config.voidware_auth, "discover_provider_credentials", return_value=[]),
            patch.object(
                config,
                "_keyring_get",
                side_effect=lambda name: "sk-voidware" if name in config.PROVIDER_KEY_NAMES else "",
            ),
            patch.object(config, "_legacy_secret", return_value=""),
        ):
            state = config.public_provider_state()

        auth = state["auth"]
        self.assertEqual(auth["precedence"], ["env", "voidware-provider", "voidware-broker", "voidware-keystore", "keyring-legacy"])
        self.assertEqual(auth["provider"]["source"], "voidware-keystore")
        self.assertFalse(auth["provider"]["legacy_migration_available"])
        self.assertTrue(auth["provider"]["configured"])


if __name__ == "__main__":
    unittest.main()
