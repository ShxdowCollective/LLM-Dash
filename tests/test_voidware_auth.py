from __future__ import annotations

import json
import os
import shutil
import subprocess
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
        voidware_auth._APPROVED_SECRET_CACHE.clear()
        env = {key: "" for key in ENV_KEYS}
        env[config.SHXDOW_ROOT_ENV] = self.tmp.name
        patcher = patch.dict(os.environ, env, clear=False)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _write_encrypted_voidware_auth(self, auth_file: Path) -> dict:
        if not shutil.which("node"):
            self.skipTest("node is required for Voidware encrypted auth regression")
        if not (ROOT / "node_modules" / "@shxdowcollective" / "voidware").exists():
            self.skipTest("@shxdowcollective/voidware is not installed")
        script = """
import { setPasswordProvider, saveStoredAuth, getStoredAuth } from '@shxdowcollective/voidware/auth'
import { readFile } from 'node:fs/promises'

const authPath = process.argv[2]
setPasswordProvider(async () => 'llm-dash-install-over-regression')
await saveStoredAuth(
  'alpha',
  {
    name: 'alpha',
    secret: 'sk-real-retained',
    baseURL: 'https://api.alpha.example',
    providerFamily: 'openai',
  },
  { authOverridePath: authPath, skipKeyring: true },
)
const auth = await getStoredAuth({ name: 'alpha', authOverridePath: authPath, skipKeyring: true })
const raw = JSON.parse(await readFile(authPath, 'utf8'))
console.log(JSON.stringify({ auth, raw }))
"""
        result = subprocess.run(
            ["node", "--input-type=module", "-", str(auth_file)],
            cwd=ROOT,
            input=script,
            text=True,
            capture_output=True,
            check=True,
        )
        return json.loads(result.stdout)

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

    def test_opencode_go_model_prefix_is_normalized_case_insensitively(self) -> None:
        self.assertEqual(
            config.normalize_provider_model_id("https://opencode.ai/zen/go", "OpenCode-Go/mimo-v2.5"),
            "mimo-v2.5",
        )
        self.assertEqual(
            config.normalize_provider_model_id("https://api.example.com", "opencode-go/mimo-v2.5"),
            "opencode-go/mimo-v2.5",
        )

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

    def test_new_provider_key_does_not_fall_back_to_keyring_when_broker_is_unavailable(self) -> None:
        stored: dict[str, str] = {}

        def broker_unavailable(*args, **kwargs) -> None:
            raise voidware_auth.VoidwareAuthError("auth broker unavailable", code="broker_unavailable")

        with (
            patch.object(config.voidware_auth, "write_secret", side_effect=broker_unavailable),
            patch.object(config.voidware_auth, "read_secret", return_value=""),
            patch.object(config, "_keyring_set", side_effect=lambda name, value: stored.setdefault(name, value) is not None),
        ):
            with self.assertRaises(config.ConfigError) as ctx:
                config.save_provider(
                    base_url="https://api.alpha.example",
                    api_key="sk-fallback",
                    default_model="alpha-chat",
                    endpoint_mode=config.ENDPOINT_MODE_APPEND_V1,
                )

        self.assertIn("broker_unavailable", str(ctx.exception))
        self.assertEqual(stored, {})
        persisted = config.config_path().read_text(encoding="utf-8") if config.config_path().exists() else ""
        self.assertNotIn("sk-fallback", persisted)

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

    def test_stop_background_broker_uses_voidware_cli_stop(self) -> None:
        calls: list[list[str]] = []

        def fake_run(args: list[str], **kwargs) -> dict[str, object]:
            calls.append(args)
            if args[:3] == ["auth", "broker", "status"]:
                return {
                    "ok": False,
                    "errorCode": "broker_conflict",
                    "data": {},
                }
            if args[:3] == ["auth", "broker", "ensure"]:
                return {"ok": False, "errorCode": "broker_conflict", "data": {}}
            if args[:3] == ["auth", "broker", "stop"]:
                return {"ok": True, "data": {}}
            return {"ok": False, "errorCode": "unexpected"}

        with (
            patch.object(voidware_auth._BRIDGE, "request", side_effect=voidware_auth.VoidwareAuthError("conflict", code="broker_conflict")),
            patch.object(voidware_auth, "resolve_cli", return_value=["voidware"]),
            patch.object(voidware_auth, "_run", side_effect=fake_run),
        ):
            result = voidware_auth.stop_background_broker()

        self.assertTrue(result["ok"])
        self.assertTrue(any(call[:3] == ["auth", "broker", "stop"] for call in calls))

    def test_stop_background_broker_refuses_app_owned_broker(self) -> None:
        with patch.object(
            voidware_auth._BRIDGE,
            "request",
            return_value={
                "owned": True,
                "status": {
                    "persistence": "keyring",
                    "approvalSurface": "app",
                    "canApprove": True,
                },
            },
        ):
            with self.assertRaises(voidware_auth.VoidwareAuthError) as ctx:
                voidware_auth.stop_background_broker()

        self.assertEqual(ctx.exception.code, "broker_owned")

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

    def test_approved_secret_is_reused_for_same_server_flow(self) -> None:
        grant = {"expiresAt": "2099-01-01T00:00:00Z"}
        with patch.object(
            voidware_auth._BRIDGE,
            "request",
            return_value={
                "ok": True,
                "target": "alpha",
                "secret": "sk-approved",
                "grant": grant,
            },
        ) as bridge_request:
            approved = voidware_auth.approve_pending_approval(password="pw")
            reused = voidware_auth.read_secret_with_grant("alpha")

        self.assertEqual(approved["grant"], grant)
        self.assertEqual(reused, {"secret": "sk-approved", "grant": grant})
        bridge_request.assert_called_once()

    def test_bridge_denied_write_does_not_look_saved(self) -> None:
        with patch.object(
            voidware_auth._BRIDGE,
            "request",
            return_value={
                "ok": False,
                "code": "approval_denied",
                "message": "Access denied in LLM-Dash.",
            },
        ):
            with self.assertRaises(config.ConfigError) as ctx:
                config.save_provider(
                    base_url="https://api.alpha.example",
                    api_key="sk-denied",
                    default_model="alpha-chat",
                    endpoint_mode=config.ENDPOINT_MODE_APPEND_V1,
                )

        self.assertIn("approval_denied", str(ctx.exception))
        persisted = config.config_path().read_text(encoding="utf-8") if config.config_path().exists() else ""
        self.assertNotIn("sk-denied", persisted)

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

    def test_legacy_install_over_marker_auth_file_is_treated_as_empty(self) -> None:
        auth_file = Path(self.tmp.name) / "auth.json"
        auth_file.write_text(
            json.dumps({
                "marker": "install-over-retention",
                "version": 3,
                "credentials": {},
            }),
            encoding="utf-8",
        )

        with patch.object(voidware_auth._BRIDGE, "request") as bridge_request:
            secret = voidware_auth.read_secret("alpha")
            discovered = voidware_auth.discover_provider_credentials()

        bridge_request.assert_not_called()
        self.assertEqual(secret, "")
        self.assertEqual(discovered, [])

    def test_legacy_install_over_marker_auth_file_overrides_approved_cache(self) -> None:
        auth_file = Path(self.tmp.name) / "auth.json"
        auth_file.write_text(
            json.dumps({
                "marker": "install-over-retention",
                "version": 3,
                "credentials": {},
            }),
            encoding="utf-8",
        )
        voidware_auth._APPROVED_SECRET_CACHE["alpha"] = {"secret": "sk-cached", "grant": {}}

        self.assertEqual(voidware_auth.read_secret("alpha"), "")

    def test_broker_status_short_circuits_legacy_install_over_marker(self) -> None:
        auth_file = Path(self.tmp.name) / "auth.json"
        auth_file.write_text(
            json.dumps({
                "marker": "install-over-retention",
                "version": 3,
                "credentials": {},
            }),
            encoding="utf-8",
        )

        with patch.object(voidware_auth._BRIDGE, "request") as bridge_request:
            status = voidware_auth.broker_status()

        bridge_request.assert_not_called()
        self.assertEqual(status["error_code"], "legacy_install_over_marker")

    def test_public_provider_state_exposes_legacy_marker_for_recovery_copy(self) -> None:
        auth_file = Path(self.tmp.name) / "auth.json"
        auth_file.write_text(
            json.dumps({
                "marker": "install-over-retention",
                "version": 3,
                "credentials": {},
            }),
            encoding="utf-8",
        )

        with patch.object(config.voidware_auth, "discover_provider_credentials", return_value=[]):
            state = config.public_provider_state()

        self.assertFalse(state["has_provider"])
        self.assertEqual(state["auth"]["broker"]["error_code"], "legacy_install_over_marker")

    def test_marker_only_without_old_tool_marker_is_not_recovered(self) -> None:
        auth_file = Path(self.tmp.name) / "auth.json"
        auth_file.write_text(json.dumps({"version": 3, "credentials": {}}), encoding="utf-8")

        self.assertFalse(voidware_auth._is_legacy_install_over_auth_marker(auth_file))

    def test_valid_empty_encrypted_v3_shape_is_not_marker_recovered(self) -> None:
        auth_file = Path(self.tmp.name) / "auth.json"
        auth_file.write_text(
            json.dumps({
                "version": 3,
                "encryption": {
                    "kdf": "scrypt",
                    "kdfParams": {"N": 16384, "r": 8, "p": 1, "keyLen": 32},
                    "cipher": "aes-256-gcm",
                    "salt": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
                },
                "credentials": {},
            }),
            encoding="utf-8",
        )

        self.assertFalse(voidware_auth._is_legacy_install_over_auth_marker(auth_file))

    def test_plaintext_v2_and_corrupt_json_are_not_marker_recovered(self) -> None:
        auth_file = Path(self.tmp.name) / "auth.json"
        auth_file.write_text(json.dumps({"version": 2, "credentials": {}}), encoding="utf-8")
        self.assertFalse(voidware_auth._is_legacy_install_over_auth_marker(auth_file))

        auth_file.write_text("{", encoding="utf-8")
        self.assertFalse(voidware_auth._is_legacy_install_over_auth_marker(auth_file))

    def test_install_over_marker_sidecar_does_not_overwrite_encrypted_auth(self) -> None:
        auth_file = Path(self.tmp.name) / "auth.json"
        written = self._write_encrypted_voidware_auth(auth_file)
        before = auth_file.read_text(encoding="utf-8")
        marker_file = Path(self.tmp.name) / voidware_auth.INSTALL_OVER_MARKER_FILE

        marker_file.write_text(
            json.dumps({
                "marker": "install-over-retention",
                "version": 3,
                "credentials": {},
            }),
            encoding="utf-8",
        )

        self.assertEqual(auth_file.read_text(encoding="utf-8"), before)
        self.assertIn("encryption", json.loads(before))
        self.assertEqual(written["auth"]["secret"], "sk-real-retained")

    def test_marker_auth_file_is_moved_before_secret_write(self) -> None:
        auth_file = Path(self.tmp.name) / "auth.json"
        auth_file.write_text(
            json.dumps({
                "marker": "install-over-retention",
                "version": 3,
                "credentials": {},
            }),
            encoding="utf-8",
        )

        self.assertTrue(voidware_auth._move_legacy_install_over_auth_marker())
        self.assertFalse(auth_file.exists())
        self.assertTrue((Path(self.tmp.name) / voidware_auth.INSTALL_OVER_MARKER_FILE).exists())

    def test_write_secret_moves_marker_auth_file_before_bridge_write(self) -> None:
        auth_file = Path(self.tmp.name) / "auth.json"
        auth_file.write_text(
            json.dumps({
                "marker": "install-over-retention",
                "version": 3,
                "credentials": {},
            }),
            encoding="utf-8",
        )

        with patch.object(voidware_auth._BRIDGE, "request", return_value={"ok": True}) as bridge_request:
            voidware_auth.write_secret("alpha", "sk-new")

        bridge_request.assert_called_once()
        self.assertFalse(auth_file.exists())
        self.assertTrue((Path(self.tmp.name) / voidware_auth.INSTALL_OVER_MARKER_FILE).exists())

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
