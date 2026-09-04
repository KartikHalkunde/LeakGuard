# EXPECT: CLEAN
from contextlib import ExitStack
def read(path):
    with ExitStack() as stack:
        f = stack.enter_context(open(path))
        return f.read()
