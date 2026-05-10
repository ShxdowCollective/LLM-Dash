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

    def test_broker_grant_cache_preserves_renewal_state(self) -> None:
        stored: dict[tuple[str, str], str] = {}

        def fake_set(service: str, account: str, value: str) -> None:
            stored[(service, account)] = value

        def fake_get(service: str, account: str) -> str:
            return stored.get((service, account), "")

        def fake_delete(service: str, account: str) -> None:
            stored.pop((service, account), None)

        grant_payload = {
            "grantToken": "vwgr_test_token",
            "grant": {
                "expiresAt": "2099-01-01T00:00:00Z",
                "ttlMs": 10_368_000_000,
                "renewalWindowStartsAt": "2098-10-01T00:00:00Z",
                "renewalRecommended": True,
            },
        }

        with (
            patch.object(voidware_auth, "_auth_fingerprint", return_value="fingerprint"),
            patch.object(voidware_auth, "_keyring_set", side_effect=fake_set),
            patch.object(voidware_auth, "_keyring_get", side_effect=fake_get),
            patch.object(voidware_auth, "_keyring_delete", side_effect=fake_delete),
        ):
            voidware_auth._store_cached_grant(
                "account",
                grant_payload,
                operation="auth:secret:read",
                target="alpha",
                scope="auth:secret:read:alpha",
            )
            cached = voidware_auth._load_cached_grant("account")

        self.assertEqual(cached["grantToken"], "vwgr_test_token")
        self.assertEqual(cached["expiresAt"], "2099-01-01T00:00:00Z")
        self.assertEqual(cached["renewalWindowStartsAt"], "2098-10-01T00:00:00Z")
        self.assertIs(cached["renewalRecommended"], True)

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


if __name__ == "__main__":
    unittest.main()
