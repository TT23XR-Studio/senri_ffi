import os
import platform
import subprocess
from pathlib import Path

import pytest

from senri_ffi.adapters.ctypes_adapter import CtypesAdapter
from senri_ffi.globals import set_global_adapter
from senri_ffi.memory import alloc, free
from senri_ffi.registry import get_resource_registry
from senri_ffi.struct import set_struct_alloc

ROOT = Path(__file__).resolve().parent.parent.parent.parent
TEST_LIB_DIR = ROOT / "test-lib"


def _build_test_lib() -> Path | None:
    if not TEST_LIB_DIR.exists():
        return None
    system = platform.system()
    if system == "Windows":
        lib_path = TEST_LIB_DIR / "target" / "release" / "senri_test.dll"
    elif system == "Darwin":
        lib_path = TEST_LIB_DIR / "target" / "release" / "libsenri_test.dylib"
    else:
        lib_path = TEST_LIB_DIR / "target" / "release" / "libsenri_test.so"

    if lib_path.exists():
        return lib_path

    cargo = subprocess.run(
        ["cargo", "build", "--release"],
        cwd=str(TEST_LIB_DIR),
        capture_output=True,
        text=True,
    )
    if cargo.returncode != 0:
        return None
    return lib_path if lib_path.exists() else None


TEST_LIB_PATH = _build_test_lib()


@pytest.fixture
def adapter():
    ad = CtypesAdapter()
    if get_resource_registry().has_active_resources():
        get_resource_registry().clear()
        set_global_adapter(ad, force=True)
    else:
        set_global_adapter(ad)
    set_struct_alloc(alloc, free)
    yield ad


@pytest.fixture
def lib(adapter):
    from senri_ffi import Library

    if TEST_LIB_PATH is None:
        pytest.skip("test-lib not available")
    return Library.load(str(TEST_LIB_PATH))


def pytest_collection_modifyitems(config, items):
    skip_no_lib = pytest.mark.skip(reason="test-lib not available")
    for item in items:
        if "lib" in item.fixturenames and TEST_LIB_PATH is None:
            item.add_marker(skip_no_lib)
