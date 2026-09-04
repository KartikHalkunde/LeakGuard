"""LeakGuard - static resource-leak detection for Python."""

from leakguard.core.finding import Confidence, Finding, PathStep
from leakguard.engine import analyze

__version__ = "0.1.0"
__all__ = ["analyze", "Finding", "Confidence", "PathStep"]
