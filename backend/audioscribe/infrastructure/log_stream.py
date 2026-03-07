import sys


class LogBus:
    def write(self, message: str) -> None:
        try:
            print(message, flush=True)
        except UnicodeEncodeError:
            safe = message.encode("utf-8", errors="backslashreplace").decode("utf-8", errors="ignore")
            try:
                print(safe, flush=True)
            except Exception:
                try:
                    sys.stdout.buffer.write((safe + "\n").encode("utf-8", errors="backslashreplace"))
                    sys.stdout.flush()
                except Exception:
                    pass


log_bus = LogBus()
