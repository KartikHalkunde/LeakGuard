# EXPECT: LEAK var=f line=3
def load(path):
    f = open(path)
    try:
        use(f)
    except Exception:
        f.close()
    return "done"
