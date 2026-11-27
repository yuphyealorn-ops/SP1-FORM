#!/usr/bin/env python3
"""End-to-end check in a real browser. Starts its own server on a temp database.

    pip install playwright && playwright install chromium
    python3 scripts/e2e.py [--shots DIR]
"""
import argparse
import re
import sys
import tempfile
import threading
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from playwright.sync_api import expect, sync_playwright  # noqa: E402

from form.config import Config  # noqa: E402
from form.seed import run as seed_run  # noqa: E402
from form.server import make_server  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--shots", default=None)
args = ap.parse_args()

tmp = tempfile.TemporaryDirectory()
cfg = Config(db_path=Path(tmp.name) / "e2e.db", port=0, now_fn=lambda: datetime(2026, 11, 25, 12, 0))
server, _ = make_server(cfg)
seed_run(cfg, demo=True)
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{server.server_address[1]}"
shots = Path(args.shots) if args.shots else None
if shots:
    shots.mkdir(parents=True, exist_ok=True)


def shot(page, name):
    if shots:
        page.screenshot(path=str(shots / f"{name}.png"), full_page=True)


def register(browser, name):
    ctx = browser.new_context(viewport={"width": 1100, "height": 900})
    page = ctx.new_page()
    problems = []
    page.on("console", lambda m: problems.append(m.text) if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: problems.append(str(e)))
    page.goto(BASE)
    page.get_by_role("link", name="Create an account").click()
    page.fill("[name=username]", name)
    page.fill("[name=password]", "correct-horse-1")
    page.select_option("[name=level]", "intermediate")
    page.get_by_role("button", name="Create account").click()
    page.wait_for_selector(".topbar")
    return page, problems


def step(msg):
    print("  ok ·", msg)


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page, problems = register(browser, "tester")
    step("registered and signed in")

    # --- timetable and walking times (requirement 1)
    page.goto(f"{BASE}/#/settings")
    page.wait_for_selector("text=Add a class")
    page.select_option("form:has(h2:text('Profile')) [name=default_gym_id]", label="Campus Gym")
    page.locator("form:has(h2:text('Profile'))").get_by_role("button", name="Save").click()
    for start, end, title in (("09:00", "11:00", "Maths"), ("13:00", "15:00", "Physics")):
        f = page.locator("form:has(h2:text('Add a class'))")
        f.locator("[name=weekday]").select_option("0")  # Monday
        f.locator("[name=start]").fill(start)
        f.locator("[name=end]").fill(end)
        f.locator("[name=title]").fill(title)
        f.locator("[name=place_id]").select_option(label="Building A")
        f.get_by_role("button", name="Add class").click()
        page.wait_for_selector(f"td:text('{title}')")
    cell = page.locator("tr:has-text('Building A') input").first  # Campus Gym column
    cell.fill("20")
    cell.dispatch_event("change")
    page.wait_for_selector(".toast:text('Saved')")
    cell.fill("15")
    cell.dispatch_event("change")
    page.wait_for_timeout(400)
    step("timetable and a 15-minute walk saved")
    shot(page, "settings")

    # 2h gap, 15 min each way -> 75 min
    page.goto(f"{BASE}/#/plan")
    page.wait_for_selector(".week-strip")
    page.get_by_role("button", name=re.compile(r"^Mon 30|^30")).first.click()
    page.wait_for_selector("text=between classes")
    card = page.locator("section.card:has-text('between classes')")
    expect(card).to_contain_text("75-min workout")
    expect(card).to_contain_text("15 walk there")
    step("planner: 120-min gap with 15 min travel each way gives a 75-min workout")
    shot(page, "plan")

    # --- log a workout from the planner
    page.get_by_role("button", name=re.compile(r"^(Today|Wed)")).first.click()
    page.wait_for_selector("text=Log as done")
    page.get_by_role("button", name="Log as done").first.click()
    page.wait_for_selector(".toast:text('Workout logged')")
    page.goto(f"{BASE}/#/log")
    page.wait_for_selector("article.card")
    step("workout logged from the plan and listed")

    # manual log with a custom exercise
    page.get_by_role("button", name="Log a workout").click()
    f = page.locator("form:has(h2:text('Log a workout'))")
    f.locator("[name=exercise_key]").first.select_option("custom")
    f.locator("[name=name]").fill("Cable fly")
    f.locator("input[name=main][value=chest]").check()
    f.get_by_role("button", name="Save workout").click()
    page.wait_for_selector("text=Cable fly")
    step("custom exercise logged")

    # --- body measurements and charts (feature A)
    page.goto(f"{BASE}/#/body")
    page.wait_for_selector("text=Add measurements")
    page.fill("form:has(h2:text('About you')) [name=height]", "175")
    page.select_option("form:has(h2:text('About you')) [name=sex]", "male")
    page.locator("form:has(h2:text('About you'))").get_by_role("button", name="Save").click()
    for date, waist, arm in (("2026-11-01", "84", "31"), ("2026-11-24", "82", "32.5")):
        mf = page.locator("form:has(h2:text('Add measurements'))")
        mf.locator("[name=date]").fill(date)
        mf.locator("[name=weight]").fill("70")
        mf.locator("[name=waist]").fill(waist)
        mf.locator("[name=armR]").fill(arm)
        mf.get_by_role("button", name="Save measurements").click()
        page.wait_for_selector(".toast:text('Measurements saved')")
    expect(page.locator("table").first).to_contain_text("-2 cm")
    expect(page.locator("svg.chart")).to_be_visible()
    expect(page.locator(".stat").first).not_to_have_text("–")
    step("measurements saved locally, BMI/RFM shown, change since start computed")
    shot(page, "body")
    # privacy: nothing about measurements reached the server
    server_text = page.evaluate("fetch('/api/workouts',{credentials:'same-origin'}).then(r=>r.text())")
    assert "armR" not in server_text and "waist" not in server_text

    # invalid measurement is rejected
    mf = page.locator("form:has(h2:text('Add measurements'))")
    mf.locator("[name=waist]").fill("9999")
    mf.get_by_role("button", name="Save measurements").click()
    expect(mf.locator(".err:not(:empty)").first).to_be_visible()
    step("out-of-range measurement rejected with a message")

    # --- muscle map linked to body change (feature B)
    page.goto(f"{BASE}/#/muscles")
    page.wait_for_selector("svg [data-muscle=chest]")
    page.locator("svg [data-muscle=chest]").first.click()
    expect(page.locator(".notice")).to_contain_text("Chest")
    page.select_option("select[name=part]", "armR")
    expect(page.locator(".card:has-text('Training vs body change')")).to_contain_text("+1.5 cm")
    step("muscle map clickable; arm change shown beside biceps/triceps points")
    shot(page, "muscles")

    # --- groups (requirement 2 and 4)
    page.goto(f"{BASE}/#/groups")
    page.wait_for_selector("text=Start a group")
    gf = page.locator("form:has(h2:text('Start a group'))")
    gf.locator("[name=name]").fill("Cup prep")
    gf.get_by_role("button", name="Create group").click()
    page.wait_for_selector("h1:text('Cup prep')")
    expect(page.locator("body")).to_contain_text("Endurance")
    expect(page.locator("body")).to_contain_text("Lower-body strength")
    expect(page.locator("body")).to_contain_text("Speed")
    expect(page.locator("body")).to_contain_text("Mobility")
    code = page.locator(".notice strong").inner_text()
    step(f"football-prep group suggests endurance / lower-body / speed / mobility (code {code})")
    page.locator("form:has(h2:text('Check in'))").get_by_role("button", name="Check in").click()
    page.wait_for_selector(".toast:text('Checked in')")
    expect(page.locator("section:has(h2:text-is('This week'))")).to_contain_text("1")
    pf = page.locator("form:has(h2:text('Share with the group'))")
    pf.locator("[name=title]").fill("Sprint drills")
    pf.locator("[name=url]").fill("https://example.com/drills")
    pf.get_by_role("button", name="Post").click()
    page.wait_for_selector("text=Sprint drills")
    pf.locator("[name=kind]").select_option("plan")
    pf.locator("[name=title]").fill("Leg day plan")
    pf.locator("[name=workout_id]").select_option(index=1)
    pf.get_by_role("button", name="Post").click()
    page.wait_for_selector("text=Leg day plan")
    step("check-in, shared link and shared workout plan")
    shot(page, "group")

    # second user joins by code and sees the same group
    page2, problems2 = register(browser, "friend")
    page2.goto(f"{BASE}/#/groups")
    page2.wait_for_selector("text=Join with a code")
    page2.fill("[name=invite_code]", code)
    page2.get_by_role("button", name="Join group").click()
    page2.wait_for_selector("h1:text('Cup prep')")
    expect(page2.locator("body")).to_contain_text("Sprint drills")
    expect(page2.locator(".notice strong")).to_have_count(0)  # only the owner sees the invite code
    step("second student joined by invite code")

    # --- gym buddy (requirement 3)
    page.goto(f"{BASE}/#/buddy")
    page.wait_for_selector("text=Post a session")
    bf = page.locator("form:has(h2:text('Post a session'))")
    bf.locator("[name=session_on]").fill("2026-11-27")
    bf.locator("[name=start]").fill("17:00")
    bf.get_by_role("button", name="Post session").click()
    page.wait_for_selector(".toast")
    page2.goto(f"{BASE}/#/buddy")
    page2.wait_for_selector("article:has-text('tester')")
    expect(page2.locator("article:has-text('tester')")).to_contain_text("match")
    page2.locator("article:has-text('tester')").get_by_role("button", name="Join session").click()
    page2.wait_for_selector("text=You joined")
    shot(page2, "buddy")
    page.reload()  # same URL, so reload to fetch the new partner
    page.wait_for_selector("text=Partners: friend")
    step("gym buddy: posted, ranked with reasons, joined, host sees partner")

    # --- sign out and auth guard
    page.get_by_role("button", name="Sign out").click()
    page.wait_for_selector("text=Welcome back")
    step("signed out")

    mobile = browser.new_context(viewport={"width": 390, "height": 800}, device_scale_factor=2)
    mp = mobile.new_page()
    mp.goto(BASE)
    mp.fill("[name=username]", "mali")
    mp.fill("[name=password]", "demo-pass-1")
    mp.get_by_role("button", name="Sign in").click()
    mp.wait_for_selector(".topbar")
    for route in ("", "plan", "muscles", "buddy"):
        mp.goto(f"{BASE}/#/{route}")
        mp.wait_for_timeout(500)
        overflow = mp.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
        assert not overflow, f"horizontal scroll on mobile at /{route}"
        shot(mp, f"mobile_{route or 'today'}")
    step("mobile width: no horizontal scrolling")

    assert not problems and not problems2, (problems, problems2)
    step("no console errors or CSP violations")
    browser.close()

server.shutdown()
print("E2E PASSED")
