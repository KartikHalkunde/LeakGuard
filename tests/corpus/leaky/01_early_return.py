# EXPECT: LEAK var=f line=3 confidence=likely
def read(path, bad):
    f = open(path)
    if bad:
        return None
    f.close()
    return "ok"
