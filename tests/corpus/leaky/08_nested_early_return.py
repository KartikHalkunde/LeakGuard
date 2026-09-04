# EXPECT: LEAK var=f line=3 confidence=likely
def process(path, cond_a, cond_b):
    f = open(path)
    if cond_a:
        if cond_b:
            return None
    f.close()
    return True
