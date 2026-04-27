#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import platform
import plistlib
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RUN_UPDATE_PATH = ROOT / "scripts" / "run_update.py"
LOGS_DIR = ROOT / "logs"
SCHEDULE_PATH = Path.home() / ".shxdow" / "config" / "shxdow.llmdash.schedule.json"

JOB_NAME = "shxdow.llmdash.update"
SYSTEMD_SERVICE = f"{JOB_NAME}.service"
SYSTEMD_TIMER = f"{JOB_NAME}.timer"
LAUNCHD_LABEL = JOB_NAME
WINDOWS_TASK = r"Shxdow\LLM-Dash Update"


class ScheduleError(RuntimeError):
    pass


def _read_schedule_file() -> dict[str, Any]:
    try:
        with SCHEDULE_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}


def _write_schedule_file(data: dict[str, Any]) -> None:
    SCHEDULE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = SCHEDULE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(SCHEDULE_PATH)


def _run(command: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=ROOT, capture_output=True, text=True, check=check)


def _platform_id() -> str:
    system = platform.system()
    if system == "Darwin":
        return "macos"
    if system == "Windows":
        return "windows"
    if "microsoft" in platform.uname().release.lower() or Path("/proc/sys/fs/binfmt_misc/WSLInterop").exists():
        return "wsl"
    return "linux"


def _parse_time(value: str) -> tuple[int, int]:
    try:
        hour_s, minute_s = str(value or "09:00").split(":", 1)
        hour = int(hour_s)
        minute = int(minute_s)
    except Exception as exc:
        raise ScheduleError("time_local must use HH:MM") from exc
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        raise ScheduleError("time_local must use a valid 24-hour time")
    return hour, minute


def _normalize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    cadence = str(payload.get("cadence") or "off").lower()
    if cadence not in {"off", "daily", "weekly", "monthly"}:
        raise ScheduleError("cadence must be off, daily, weekly, or monthly")
    hour, minute = _parse_time(str(payload.get("time_local") or "09:00"))
    day_of_week = int(payload.get("day_of_week") or 1)
    day_of_month = int(payload.get("day_of_month") or 1)
    if day_of_week < 1 or day_of_week > 7:
        raise ScheduleError("day_of_week must be 1-7")
    if day_of_month < 1 or day_of_month > 28:
        raise ScheduleError("day_of_month must be 1-28")
    return {
        "cadence": cadence,
        "time_local": f"{hour:02d}:{minute:02d}",
        "day_of_week": day_of_week,
        "day_of_month": day_of_month,
    }


def utc_echo(time_local: str) -> str:
    hour, minute = _parse_time(time_local)
    now = dt.datetime.now().astimezone()
    local = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return local.astimezone(dt.timezone.utc).strftime("%H:%M UTC")


def _systemd_available() -> bool:
    if not shutil.which("systemctl"):
        return False
    result = subprocess.run(["systemctl", "--user", "status"], capture_output=True, text=True)
    return result.returncode in {0, 3}


def _systemd_on_calendar(schedule: dict[str, Any]) -> str:
    hour, minute = _parse_time(schedule["time_local"])
    cadence = schedule["cadence"]
    if cadence == "daily":
        return f"*-*-* {hour:02d}:{minute:02d}:00"
    if cadence == "weekly":
        weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        return f"{weekdays[schedule['day_of_week'] - 1]} *-*-* {hour:02d}:{minute:02d}:00"
    return f"*-*-{schedule['day_of_month']:02d} {hour:02d}:{minute:02d}:00"


def _install_systemd(schedule: dict[str, Any]) -> dict[str, str]:
    if not _systemd_available():
        raise ScheduleError("systemd user timers are not available in this Linux/WSL session")
    user_dir = Path.home() / ".config" / "systemd" / "user"
    user_dir.mkdir(parents=True, exist_ok=True)
    log_path = LOGS_DIR / "scheduled-run.log"
    service = user_dir / SYSTEMD_SERVICE
    timer = user_dir / SYSTEMD_TIMER
    old_service = service.read_text(encoding="utf-8") if service.exists() else None
    old_timer = timer.read_text(encoding="utf-8") if timer.exists() else None
    service.write_text(
        "\n".join(
            [
                "[Unit]",
                "Description=LLM-Dash scheduled update",
                "",
                "[Service]",
                "Type=oneshot",
                f"WorkingDirectory={ROOT}",
                f"ExecStart={sys.executable} {RUN_UPDATE_PATH} --log-path {log_path}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    timer.write_text(
        "\n".join(
            [
                "[Unit]",
                "Description=LLM-Dash scheduled update timer",
                "",
                "[Timer]",
                f"OnCalendar={_systemd_on_calendar(schedule)}",
                "Persistent=true",
                "",
                "[Install]",
                "WantedBy=timers.target",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    try:
        _run(["systemctl", "--user", "daemon-reload"])
        _run(["systemctl", "--user", "enable", "--now", SYSTEMD_TIMER])
    except Exception:
        if old_service is not None:
            service.write_text(old_service, encoding="utf-8")
        else:
            service.unlink(missing_ok=True)
        if old_timer is not None:
            timer.write_text(old_timer, encoding="utf-8")
        else:
            timer.unlink(missing_ok=True)
        _run(["systemctl", "--user", "daemon-reload"], check=False)
        raise
    return {"manager": "systemd", "job_id": SYSTEMD_TIMER, "log_path": str(log_path)}


def _remove_systemd() -> None:
    if shutil.which("systemctl"):
        _run(["systemctl", "--user", "disable", "--now", SYSTEMD_TIMER], check=False)
        _run(["systemctl", "--user", "daemon-reload"], check=False)
    user_dir = Path.home() / ".config" / "systemd" / "user"
    for name in (SYSTEMD_TIMER, SYSTEMD_SERVICE):
        try:
            (user_dir / name).unlink()
        except FileNotFoundError:
            pass


def _launchd_interval(schedule: dict[str, Any]) -> dict[str, int]:
    hour, minute = _parse_time(schedule["time_local"])
    data: dict[str, int] = {"Hour": hour, "Minute": minute}
    if schedule["cadence"] == "weekly":
        data["Weekday"] = schedule["day_of_week"]
    elif schedule["cadence"] == "monthly":
        data["Day"] = schedule["day_of_month"]
    return data


def _install_launchd(schedule: dict[str, Any]) -> dict[str, str]:
    agents = Path.home() / "Library" / "LaunchAgents"
    agents.mkdir(parents=True, exist_ok=True)
    log_path = LOGS_DIR / "scheduled-run.log"
    plist_path = agents / f"{LAUNCHD_LABEL}.plist"
    old_plist = plist_path.read_bytes() if plist_path.exists() else None
    plist = {
        "Label": LAUNCHD_LABEL,
        "ProgramArguments": [sys.executable, str(RUN_UPDATE_PATH), "--log-path", str(log_path)],
        "WorkingDirectory": str(ROOT),
        "StartCalendarInterval": _launchd_interval(schedule),
        "StandardOutPath": str(log_path),
        "StandardErrorPath": str(log_path),
    }
    with plist_path.open("wb") as f:
        plistlib.dump(plist, f)
    uid = subprocess.run(["id", "-u"], capture_output=True, text=True, check=True).stdout.strip()
    _run(["launchctl", "bootout", f"gui/{uid}", str(plist_path)], check=False)
    try:
        _run(["launchctl", "bootstrap", f"gui/{uid}", str(plist_path)])
    except Exception:
        if old_plist is not None:
            plist_path.write_bytes(old_plist)
            _run(["launchctl", "bootstrap", f"gui/{uid}", str(plist_path)], check=False)
        else:
            plist_path.unlink(missing_ok=True)
        raise
    _run(["launchctl", "enable", f"gui/{uid}/{LAUNCHD_LABEL}"], check=False)
    return {"manager": "launchd", "job_id": LAUNCHD_LABEL, "log_path": str(log_path)}


def _remove_launchd() -> None:
    plist_path = Path.home() / "Library" / "LaunchAgents" / f"{LAUNCHD_LABEL}.plist"
    try:
        uid = subprocess.run(["id", "-u"], capture_output=True, text=True, check=True).stdout.strip()
        _run(["launchctl", "bootout", f"gui/{uid}", str(plist_path)], check=False)
    except Exception:
        pass
    try:
        plist_path.unlink()
    except FileNotFoundError:
        pass


def _windows_schedule(schedule: dict[str, Any]) -> str:
    cadence = schedule["cadence"]
    time_local = schedule["time_local"]
    start = f"<StartBoundary>2026-01-01T{time_local}:00</StartBoundary>"
    if cadence == "daily":
        return f"{start}<ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>"
    if cadence == "weekly":
        days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        return f"{start}<ScheduleByWeek><WeeksInterval>1</WeeksInterval><DaysOfWeek><{days[schedule['day_of_week'] - 1]}/></DaysOfWeek></ScheduleByWeek>"
    return f"{start}<ScheduleByMonth><DaysOfMonth><Day>{schedule['day_of_month']}</Day></DaysOfMonth><Months><January/><February/><March/><April/><May/><June/><July/><August/><September/><October/><November/><December/></Months></ScheduleByMonth>"


def _install_windows(schedule: dict[str, Any]) -> dict[str, str]:
    if not shutil.which("schtasks"):
        raise ScheduleError("schtasks.exe was not found")
    log_path = LOGS_DIR / "scheduled-run.log"
    cadence_xml = _windows_schedule(schedule)
    xml = f"""<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers><CalendarTrigger>{cadence_xml}</CalendarTrigger></Triggers>
  <Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><Enabled>true</Enabled></Settings>
  <Actions Context="Author"><Exec><Command>{sys.executable}</Command><Arguments>{RUN_UPDATE_PATH} --log-path {log_path}</Arguments><WorkingDirectory>{ROOT}</WorkingDirectory></Exec></Actions>
</Task>
"""
    with tempfile.NamedTemporaryFile("w", suffix=".xml", delete=False, encoding="utf-16") as f:
        f.write(xml)
        xml_path = f.name
    try:
        _run(["schtasks", "/Create", "/TN", WINDOWS_TASK, "/XML", xml_path, "/F"])
    finally:
        Path(xml_path).unlink(missing_ok=True)
    return {"manager": "schtasks", "job_id": WINDOWS_TASK, "log_path": str(log_path)}


def _remove_windows() -> None:
    if shutil.which("schtasks"):
        _run(["schtasks", "/Delete", "/TN", WINDOWS_TASK, "/F"], check=False)


def _systemd_job_present(job_id: str) -> bool:
    if not shutil.which("systemctl"):
        return False
    result = _run(["systemctl", "--user", "list-timers", "--all", "--no-legend", job_id or SYSTEMD_TIMER], check=False)
    return (job_id or SYSTEMD_TIMER) in (result.stdout + result.stderr)


def _launchd_job_present(job_id: str) -> bool:
    if not shutil.which("launchctl"):
        return False
    result = _run(["launchctl", "list", job_id or LAUNCHD_LABEL], check=False)
    return result.returncode == 0


def _windows_job_present(job_id: str) -> bool:
    if not shutil.which("schtasks"):
        return False
    result = _run(["schtasks", "/Query", "/TN", job_id or WINDOWS_TASK], check=False)
    return result.returncode == 0


def _job_present(data: dict[str, Any]) -> bool:
    manager = str(data.get("manager") or "")
    job_id = str(data.get("job_id") or "")
    if manager == "systemd":
        return _systemd_job_present(job_id)
    if manager == "launchd":
        return _launchd_job_present(job_id)
    if manager == "schtasks":
        return _windows_job_present(job_id)
    return False


def remove_schedule() -> dict[str, Any]:
    manager = status().get("manager") or _platform_id()
    if manager in {"linux", "wsl", "systemd"}:
        _remove_systemd()
    elif manager in {"macos", "launchd"}:
        _remove_launchd()
    elif manager in {"windows", "schtasks"}:
        _remove_windows()
    _write_schedule_file({"cadence": "off", "platform": _platform_id(), "enabled": False})
    return status()


def apply_schedule(payload: dict[str, Any]) -> dict[str, Any]:
    schedule = _normalize_payload(payload)
    if schedule["cadence"] == "off":
        return remove_schedule()
    platform_id = _platform_id()
    if platform_id in {"linux", "wsl"}:
        installed = _install_systemd(schedule)
    elif platform_id == "macos":
        installed = _install_launchd(schedule)
    elif platform_id == "windows":
        installed = _install_windows(schedule)
    else:
        raise ScheduleError(f"Unsupported platform: {platform_id}")
    data = {
        **schedule,
        **installed,
        "platform": platform_id,
        "enabled": True,
        "utc_echo": utc_echo(schedule["time_local"]),
        "updated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }
    _write_schedule_file(data)
    return status()


def status() -> dict[str, Any]:
    data = _read_schedule_file()
    cadence = str(data.get("cadence") or "off")
    time_local = str(data.get("time_local") or "09:00")
    job_present = _job_present(data) if cadence != "off" and data.get("enabled") else False
    return {
        "enabled": cadence != "off" and bool(data.get("enabled")) and job_present,
        "cadence": cadence,
        "time_local": time_local,
        "day_of_week": int(data.get("day_of_week") or 1),
        "day_of_month": int(data.get("day_of_month") or 1),
        "utc_echo": utc_echo(time_local),
        "job_present": job_present,
        "platform": data.get("platform") or _platform_id(),
        "manager": data.get("manager") or "",
        "job_id": data.get("job_id") or "",
        "log_path": data.get("log_path") or "",
        "updated_at": data.get("updated_at") or "",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("status", "apply", "remove"))
    parser.add_argument("--payload", default="")
    args = parser.parse_args()
    try:
        if args.command == "status":
            result = status()
        elif args.command == "remove":
            result = remove_schedule()
        else:
            result = apply_schedule(json.loads(args.payload or "{}"))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        return 1
    print(json.dumps({"ok": True, **result}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
