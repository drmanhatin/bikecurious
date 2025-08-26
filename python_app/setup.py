from setuptools import setup

APP = ['helth_daemon.py']
DATA_FILES = []
OPTIONS = {
    'argv_emulation': False,
    'plist': {
        'LSUIElement': True,  # Hide from dock
        'CFBundleName': 'Helth Daemon',
        'CFBundleDisplayName': 'Helth Daemon',
        'CFBundleIdentifier': 'com.helth.daemon',
        'CFBundleVersion': '1.0.0',
        'NSHighResolutionCapable': True,
    },
    'packages': ['rumps', 'bleak', 'asyncio_mqtt'],
    'includes': ['iconsole_reader', 'menubar_app'],
    'excludes': ['tkinter', 'test', 'unittest', 'distutils'],
}

setup(
    app=APP,
    data_files=DATA_FILES,
    options={'py2app': OPTIONS},
    setup_requires=['py2app'],
)
