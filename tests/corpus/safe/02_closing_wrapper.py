# EXPECT: CLEAN
import contextlib
from urllib.request import urlopen
def fetch(url):
    with contextlib.closing(urlopen(url)) as resp:
        return resp.read()
