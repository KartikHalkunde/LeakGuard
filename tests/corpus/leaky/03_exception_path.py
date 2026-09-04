# EXPECT: LEAK var=f line=3 confidence=likely
def load(path):
    f = open(path)
    risky()
    f.close()
    return "done"
