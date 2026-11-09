import signal
import time

signal.signal(signal.SIGINT, signal.SIG_IGN)
print('ready', flush=True)
time.sleep(120)
