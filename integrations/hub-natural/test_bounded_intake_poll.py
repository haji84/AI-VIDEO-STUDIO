"""Offline-only contract tests for the opt-in bounded INBOX poller.

These tests never call real Drive, real OAuth, a Mac, Instagram or media.
"""
import io
import json
import unittest
from unittest import mock

from drive_intake import Hold
from bounded_intake_poll import run_cycles, main

FOLDER = "SyntheticInboxFake0000001"


def outcome(*, new=0, queued=0, pending=0, held=0):
    return {
        "status": "HOLD_REVIEW_REQUIRED",
        "newImports": new, "alreadyPresent": 0, "held": held,
        "queuePending": pending, "newlyQueued": queued,
        "draftsMade": 0, "publishing": "NOT_PERFORMED",
    }


class PollerTests(unittest.TestCase):
    def test_two_successful_cycles_count_new_arrivals_once(self):
        calls = []
        sleeps = []
        data = [outcome(new=1, queued=1, pending=1),
                outcome(new=0, queued=0, pending=1)]

        def next_cycle():
            calls.append("called")
            return data[len(calls) - 1]

        report = run_cycles(next_cycle, cycles=2, interval_seconds=60,
                            sleep_fn=sleeps.append)
        self.assertEqual(len(calls), 2)
        self.assertEqual(sleeps, [60])
        self.assertEqual(report["checks"], 2)
        self.assertEqual(report["newImports"], 1)
        self.assertEqual(report["newlyQueued"], 1)
        self.assertEqual(report["lastQueuePending"], 1)
        self.assertEqual(report["publishing"], "NOT_PERFORMED")
        self.assertEqual(report["semanticRecognition"], "NOT_PERFORMED")
        self.assertEqual(report["status"], "INTAKE_ONLY_REVIEW_REQUIRED")
        self.assertNotIn("file", str(report).lower())
        self.assertNotIn(FOLDER, str(report))

    def test_later_arrival_gate_rejects_old_initial_backlog(self):
        calls = []
        data = [outcome(new=1, queued=1, pending=1),
                outcome(new=0, queued=0, pending=1),
                outcome(new=0, queued=0, pending=1)]

        def next_cycle():
            result = data[len(calls)]
            calls.append(1)
            return result

        with self.assertRaisesRegex(Hold, "POLL_NO_IMPORT_AFTER_FIRST_CHECK"):
            run_cycles(next_cycle, cycles=3, interval_seconds=60,
                       require_later_arrival=True, sleep_fn=lambda _: None)
        self.assertEqual(len(calls), 3)

    def test_later_arrival_gate_accepts_new_import_only_after_first_check(self):
        calls = []
        data = [outcome(new=1, queued=1, pending=1),
                outcome(new=1, queued=1, pending=2),
                outcome(new=0, queued=0, pending=2)]
        def check():
            result = data[len(calls)]
            calls.append(1)
            return result
        report = run_cycles(check, cycles=3, interval_seconds=60,
                            require_later_arrival=True, sleep_fn=lambda _: None)
        self.assertEqual(report["checks"], 3)
        self.assertEqual(report["newImports"], 2)
        self.assertEqual(report["newImportsAfterFirstCheck"], 1)
        self.assertEqual(report["newImportTiming"],
                         "OBSERVED_ON_LATER_CHECK_NOT_PROVIDER_CREATION_PROOF")
        self.assertFalse(report["realHostVerified"])
        self.assertEqual(report["publishing"], "NOT_PERFORMED")

    def test_later_arrival_flag_requires_multiple_checks_before_any_io(self):
        for cycles, enabled in ((1, True), (0, True), (2, 1), (2, "yes")):
            with self.subTest(cycles=cycles, enabled=enabled):
                with self.assertRaises(Hold):
                    run_cycles(lambda: self.fail("should never list Drive"),
                               cycles=cycles, interval_seconds=60,
                               require_later_arrival=enabled,
                               sleep_fn=lambda _: self.fail("should not sleep"))

    def test_cli_later_arrival_gate_refuses_old_video_only(self):
        args = [
            "--folder-id", FOLDER, "--inbox", "/fake/private/media",
            "--state", "/fake/private/state.json",
            "--catalog", "/fake/private/catalog.json",
            "--review-queue", "/fake/private/review.json",
            "--cycles", "2", "--require-new-after-first-check",
        ]
        with mock.patch("bounded_intake_poll.run_once",
                        side_effect=[outcome(new=1, queued=1, pending=1),
                                     outcome(new=0, queued=0, pending=1)]) as checked:
            with mock.patch("bounded_intake_poll.time.sleep"):
                with mock.patch("builtins.print") as printed:
                    self.assertEqual(main(args), 2)
        self.assertEqual(checked.call_count, 2)
        msg = printed.call_args.args[0]
        self.assertIn("POLL_NO_IMPORT_AFTER_FIRST_CHECK", msg)
        self.assertNotIn(FOLDER, msg)
        self.assertNotIn("/fake/private", msg)

    def test_default_one_cycle_does_not_sleep_or_post(self):
        sleeps = []
        report = run_cycles(lambda: outcome(), cycles=1,
                            interval_seconds=60, sleep_fn=sleeps.append)
        self.assertEqual(report["checks"], 1)
        self.assertEqual(sleeps, [])
        self.assertEqual(report["publishing"], "NOT_PERFORMED")

    def test_hold_stops_immediately_without_retries_or_sleep(self):
        calls = []
        sleeps = []

        def failed_cycle():
            calls.append(1)
            raise Hold("PREVIOUS_QUEUED_SOURCE_MISSING_OR_CHANGED")

        with self.assertRaisesRegex(Hold, "PREVIOUS_QUEUED_SOURCE_MISSING_OR_CHANGED"):
            run_cycles(failed_cycle, cycles=4, interval_seconds=60,
                       sleep_fn=sleeps.append)
        self.assertEqual(calls, [1])
        self.assertEqual(sleeps, [])

    def test_held_import_does_not_continue_past_first_cycle(self):
        calls = []
        sleeps = []

        def held_cycle():
            calls.append(1)
            return outcome(held=1)

        with self.assertRaisesRegex(Hold, "POLL_CYCLE_HELD_INPUTS"):
            run_cycles(held_cycle, cycles=3, interval_seconds=60,
                       sleep_fn=sleeps.append)
        self.assertEqual(calls, [1])
        self.assertEqual(sleeps, [])

    def test_bad_result_and_false_publication_rejected(self):
        bad_cases = [
            None, {}, [], "OK",
            {**outcome(), "status": "COMPLETE"},
            {**outcome(), "publishing": "POSTED"},
            {**outcome(), "draftsMade": 1},
            {**outcome(), "queuePending": -1},
            {**outcome(), "newImports": True},
            {**outcome(new=1, queued=2, pending=1)},
        ]
        for value in bad_cases:
            with self.subTest(value=str(value)[:70]):
                with self.assertRaisesRegex(Hold, "POLL_CYCLE_RESULT_INVALID"):
                    run_cycles(lambda: value, cycles=1, interval_seconds=60,
                               sleep_fn=lambda _: self.fail("must not sleep"))

    def test_bad_limits_rejected_before_any_cycle(self):
        values = ((0, 60), (25, 60), (True, 60), (1.1, 60),
                  (1, 0), (1, 59), (1, 3601), (1, True),
                  (1, "60"), (-5, 60))
        for cycles, pause in values:
            with self.subTest(cycles=cycles, pause=pause):
                with self.assertRaises(Hold):
                    run_cycles(lambda: self.fail("ran before validation"),
                               cycles=cycles, interval_seconds=pause,
                               sleep_fn=lambda _: self.fail("slept"))

    def test_cli_does_not_start_drive_without_explicit_owner_credentials(self):
        """The new CLI delegates to the existing preflight and OAuth gate."""
        args = [
            "--folder-id", FOLDER, "--inbox", "/fake/private/media",
            "--state", "/fake/private/state.json",
            "--catalog", "/fake/private/catalog.json",
            "--review-queue", "/fake/private/review.json",
        ]
        with mock.patch("bounded_intake_poll.run_once",
                        side_effect=Hold("OWNER_OAUTH_OFFLINE_AUTH_REQUIRED")) as run:
            with mock.patch("builtins.print") as printed:
                self.assertEqual(main(args), 2)
        self.assertEqual(run.call_count, 1)
        self.assertEqual(printed.call_count, 1)
        value = printed.call_args.args[0]
        self.assertIn("OWNER_OAUTH_OFFLINE_AUTH_REQUIRED", value)
        self.assertNotIn(FOLDER, value)
        self.assertNotIn("/fake/private", value)

    def test_cli_never_echoes_unrecognized_uppercase_hold_reasons(self):
        # A syntactically valid uppercase value may still contain a secret.
        # Shape-based sanitization alone is not a declassification policy.
        args = [
            "--folder-id", FOLDER, "--inbox", "/fake/private/media",
            "--state", "/fake/private/state.json",
            "--catalog", "/fake/private/catalog.json",
            "--review-queue", "/fake/private/review.json",
        ]
        for private_value in (
            "SYNTHETIC_PRIVATE_VALUE_DO_NOT_LOG_0123456789",
            "POLL_FAKE_PRIVATE_VALUE_0123456789",
        ):
            with self.subTest(private_value=private_value):
                with mock.patch("bounded_intake_poll.run_once",
                                side_effect=Hold(private_value)):
                    with mock.patch("builtins.print") as printed:
                        self.assertEqual(main(args), 2)
                report = printed.call_args.args[0]
                self.assertIn('"reason": "POLL_CYCLE_FAILED"', report)
                self.assertNotIn(private_value, report)
                self.assertNotIn(FOLDER, report)

    def test_cli_keeps_exact_audited_preflight_code(self):
        args = [
            "--folder-id", FOLDER, "--inbox", "/fake/private/media",
            "--state", "/fake/private/state.json",
            "--catalog", "/fake/private/catalog.json",
            "--review-queue", "/fake/private/review.json",
        ]
        with mock.patch("bounded_intake_poll.run_once",
                        side_effect=Hold("PREVIOUS_INTAKE_STATE_INVALID")):
            with mock.patch("builtins.print") as printed:
                self.assertEqual(main(args), 2)
        self.assertIn("PREVIOUS_INTAKE_STATE_INVALID", printed.call_args.args[0])

    def test_cli_sanitizes_untrusted_error_messages(self):
        """Never print tokens/paths even if upstream throws an unsafe message."""
        args = [
            "--folder-id", FOLDER, "--inbox", "/fake/private/media",
            "--state", "/fake/private/state.json",
            "--catalog", "/fake/private/catalog.json",
            "--review-queue", "/fake/private/review.json",
        ]
        with mock.patch("bounded_intake_poll.run_once",
                        side_effect=Hold("SECRET:/private/hidden.mp4")):
            with mock.patch("builtins.print") as printed:
                self.assertEqual(main(args), 2)
        msg = printed.call_args.args[0]
        self.assertIn("POLL_CYCLE_FAILED", msg)
        self.assertNotIn("SECRET", msg)
        self.assertNotIn("/private", msg)


    def test_cli_sanitizes_unexpected_worker_exceptions(self):
        """Unexpected exceptions must HOLD without leaking paths or token-shaped text."""
        args = [
            "--folder-id", FOLDER, "--inbox", "/fake/private/media",
            "--state", "/fake/private/state.json",
            "--catalog", "/fake/private/catalog.json",
            "--review-queue", "/fake/private/review.json",
        ]
        for failure in (
            RuntimeError("SYNTHETIC_PRIVATE_BEARER_TOKEN_0123456789"),
            OSError("SYNTHETIC /private/owner_video.mp4"),
            ValueError("SYNTHETIC_REMOTE_ID_SECRET"),
        ):
            with self.subTest(kind=type(failure).__name__):
                with mock.patch("bounded_intake_poll.run_once",
                                side_effect=failure) as worker:
                    with mock.patch("builtins.print") as printed:
                        self.assertEqual(main(args), 2)
                self.assertEqual(worker.call_count, 1)
                self.assertEqual(printed.call_count, 1)
                response = printed.call_args.args[0]
                self.assertIn('"status": "HOLD"', response)
                self.assertIn('"reason": "POLL_CYCLE_FAILED"', response)
                self.assertNotIn(str(failure), response)
                self.assertNotIn(FOLDER, response)
                self.assertNotIn("/fake/private", response)

    def test_cli_sanitizes_sleep_failure_without_retrying_drive(self):
        """A private-host sleep failure must not trigger a second Drive access."""
        args = [
            "--folder-id", FOLDER, "--inbox", "/fake/private/media",
            "--state", "/fake/private/state.json",
            "--catalog", "/fake/private/catalog.json",
            "--review-queue", "/fake/private/review.json",
            "--cycles", "2",
        ]
        # Inject the failure at the cycle boundary so this test does not
        # actually sleep: run_cycles captures time.sleep in its defaults.
        with mock.patch("bounded_intake_poll.run_cycles",
                        side_effect=OSError("PRIVATE_HOST_PATH_/secret/video.mp4")) as cycle:
            with mock.patch("bounded_intake_poll.run_once") as worker:
                with mock.patch("builtins.print") as printed:
                    self.assertEqual(main(args), 2)
        self.assertEqual(cycle.call_count, 1)
        self.assertEqual(worker.call_count, 0)
        self.assertEqual(printed.call_count, 1)
        response = printed.call_args.args[0]
        self.assertIn('"reason": "POLL_CYCLE_FAILED"', response)
        self.assertNotIn("/secret/video.mp4", response)


    def test_cli_invalid_arguments_never_echo_private_inputs(self):
        """Argument parsing itself must redact owner paths and token-like values."""
        base = [
            "--folder-id", FOLDER, "--inbox", "/fake/private/media",
            "--state", "/fake/private/state.json",
            "--catalog", "/fake/private/catalog.json",
            "--review-queue", "/fake/private/review.json",
        ]
        for extra in (
            ["--interval-seconds", "SYNTHETIC_PRIVATE_TOKEN_1234"],
            ["--cycles", "/synthetic/private/video.mp4"],
            ["--unknown-option", "SYNTHETIC_SECRET_VALUE_456"],
        ):
            with self.subTest(option=extra[0]):
                with mock.patch("bounded_intake_poll.run_once") as worker:
                    with mock.patch("sys.stderr", new_callable=io.StringIO) as stderr:
                        with mock.patch("builtins.print") as printed:
                            self.assertEqual(main(base + extra), 2)
                worker.assert_not_called()
                self.assertEqual(stderr.getvalue(), "")
                printed.assert_called_once()
                response = printed.call_args.args[0]
                self.assertIn('"status": "HOLD"', response)
                self.assertIn('"reason": "POLL_ARGUMENTS_INVALID"', response)
                self.assertNotIn("SYNTHETIC_", response)
                self.assertNotIn("/synthetic", response)
                self.assertNotIn(FOLDER, response)



class OneShotCliBoundaryTests(unittest.TestCase):
    """The direct intake entrypoint must never print owner CLI inputs or errors."""

    @staticmethod
    def args():
        return [
            "--folder-id", FOLDER, "--inbox", "/synthetic/private/media",
            "--state", "/synthetic/private/state.json",
            "--catalog", "/synthetic/private/catalog.json",
            "--review-queue", "/synthetic/private/queue.json",
        ]

    def test_direct_cli_rejects_unknown_args_without_exposing_secret_value(self):
        from new_arrival_job import main as direct_main
        with mock.patch("new_arrival_job.run_once") as worker:
            with mock.patch("sys.stderr", new_callable=io.StringIO) as stderr:
                with mock.patch("builtins.print") as printed:
                    with self.assertRaises(SystemExit) as stop:
                        direct_main(self.args() + ["--bad-option", "SYNTHETIC_SECRET_12345"])
        self.assertEqual(stop.exception.code, 2)
        worker.assert_not_called()
        self.assertEqual(stderr.getvalue(), "")
        printed.assert_called_once()
        self.assertEqual(json.loads(printed.call_args.args[0]),
                         {"status": "HOLD", "reason": "INTAKE_ARGUMENTS_INVALID"})

    def test_direct_cli_redacts_unknown_hold_and_runtime_errors(self):
        from new_arrival_job import main as direct_main
        for error in (Hold("SYNTHETIC_PRIVATE_TOKEN_987654"),
                      OSError("SYNTHETIC /private/owner-video.mp4")):
            with self.subTest(kind=type(error).__name__):
                with mock.patch("new_arrival_job.run_once", side_effect=error) as worker:
                    with mock.patch("sys.stderr", new_callable=io.StringIO) as stderr:
                        with mock.patch("builtins.print") as printed:
                            with self.assertRaises(SystemExit) as stop:
                                direct_main(self.args())
                self.assertEqual(stop.exception.code, 2)
                worker.assert_called_once()
                self.assertEqual(stderr.getvalue(), "")
                printed.assert_called_once()
                self.assertEqual(json.loads(printed.call_args.args[0]),
                                 {"status": "HOLD", "reason": "INTAKE_CYCLE_FAILED"})

    def test_direct_cli_valid_worker_keeps_review_only_summary(self):
        from new_arrival_job import main as direct_main
        with mock.patch("new_arrival_job.run_once", return_value=outcome()) as worker:
            with mock.patch("builtins.print") as printed:
                self.assertIsNone(direct_main(self.args()))
        worker.assert_called_once()
        report = json.loads(printed.call_args.args[0])
        self.assertEqual(report["publishing"], "NOT_PERFORMED")
        self.assertEqual(report["status"], "HOLD_REVIEW_REQUIRED")


if __name__ == "__main__":
    unittest.main()
