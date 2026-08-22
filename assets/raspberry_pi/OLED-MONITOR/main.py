import socket
import time
from pathlib import Path

import psutil
from gpiozero import Button
from PIL import Image, ImageDraw, ImageFont
from luma.core.interface.serial import i2c
from luma.oled.device import ssd1306


# ============================================================
# Configuration
# ============================================================

I2C_PORT = 1
I2C_ADDRESS = 0x3C

OLED_WIDTH = 128
OLED_HEIGHT = 64

USER_BUTTON_GPIO = 4

UPDATE_INTERVAL = 1.0
BUTTON_BOUNCE_TIME = 0.15


# ============================================================
# OLED
# ============================================================

serial = i2c(
    port=I2C_PORT,
    address=I2C_ADDRESS,
)

device = ssd1306(
    serial,
    width=OLED_WIDTH,
    height=OLED_HEIGHT,
)

font = ImageFont.load_default()


# ============================================================
# Button
# ============================================================

button = Button(
    USER_BUTTON_GPIO,
    pull_up=True,
    bounce_time=BUTTON_BOUNCE_TIME,
)


# ============================================================
# Page
# ============================================================

PAGE_SYSTEM = 0
PAGE_IP = 1

current_page = PAGE_SYSTEM


def toggle_page():
    global current_page

    current_page = (
        PAGE_IP
        if current_page == PAGE_SYSTEM
        else PAGE_SYSTEM
    )


button.when_pressed = toggle_page


# ============================================================
# System Information
# ============================================================

def get_cpu_usage():
    return psutil.cpu_percent(interval=None)


def get_cpu_frequency_mhz():
    try:
        freq = psutil.cpu_freq()

        if freq:
            return freq.current

    except Exception:
        pass

    try:
        path = Path(
            "/sys/devices/system/cpu/cpu0/"
            "cpufreq/scaling_cur_freq"
        )

        if path.exists():
            return int(path.read_text()) / 1000

    except Exception:
        pass

    return 0.0


def get_memory():
    memory = psutil.virtual_memory()

    return (
        memory.used / (1024 ** 2),
        memory.total / (1024 ** 2),
    )


def get_disk():
    disk = psutil.disk_usage("/")

    return (
        disk.used / (1024 ** 3),
        disk.total / (1024 ** 3),
    )


def get_temperature():
    try:
        path = Path(
            "/sys/class/thermal/"
            "thermal_zone0/temp"
        )

        if path.exists():
            return int(path.read_text()) / 1000

    except Exception:
        pass

    try:
        temperatures = psutil.sensors_temperatures()

        for entries in temperatures.values():
            for entry in entries:
                if entry.current is not None:
                    return float(entry.current)

    except Exception:
        pass

    return 0.0


def get_system_status():
    ram_used, ram_total = get_memory()
    disk_used, disk_total = get_disk()

    return {
        "cpu": get_cpu_usage(),
        "cpu_mhz": get_cpu_frequency_mhz(),
        "ram_used": ram_used,
        "ram_total": ram_total,
        "disk_used": disk_used,
        "disk_total": disk_total,
        "temperature": get_temperature(),
    }


# ============================================================
# Network
# ============================================================
def get_ip_addresses():
    interfaces = ("eth0", "eth1", "wlan0")
    addresses = psutil.net_if_addrs()

    result = {}

    for interface in interfaces:
        ip = "................"

        for address in addresses.get(interface, []):
            if address.family == socket.AF_INET:
                ip = address.address
                break

        result[interface] = ip

    return result


# ============================================================
# OLED Helpers
# ============================================================

def create_display():
    image = Image.new(
        "1",
        (OLED_WIDTH, OLED_HEIGHT),
        0,
    )

    return image, ImageDraw.Draw(image)


def draw_lines(draw, lines, positions):
    for y, line in zip(positions, lines):
        draw.text(
            (0, y),
            line,
            font=font,
            fill=255,
        )


# ============================================================
# Page 1 - System Monitor
# ============================================================

def display_system():
    data = get_system_status()

    image, draw = create_display()

    lines = [
        f"CPU : {data['cpu']:.1f}% "
        f"@ {data['cpu_mhz']:.0f}Mhz",

        f"RAM : {data['ram_used']:.2f}/"
        f"{data['ram_total']:.0f}MB",

        f"DISK: {data['disk_used']:.2f}/"
        f"{data['disk_total']:.0f}GB",

        f"TEMP: {data['temperature']:.1f}C",
    ]

    draw_lines(
        draw,
        lines,
        (0, 16, 32, 48),
    )

    device.display(image)


# ============================================================
# Page 2 - IP Address
# ============================================================

def display_ip():
    ips = get_ip_addresses()

    image, draw = create_display()

    # Header
    draw.text(
        (0, 0),
        "IP ADDRESSES:",
        font=font,
        fill=255,
    )

    # Underline
    draw.line(
        (0, 15, 100, 15),
        fill=255,
        width=1,
    )

    lines = [
        f"eth0 : {ips['eth0']}",
        f"eth1 : {ips['eth1']}",
        f"wlan0 : {ips['wlan0']}",
    ]

    draw_lines(
        draw,
        lines,
        (18, 30, 44),
    )

    device.display(image)


# ============================================================
# Main
# ============================================================

def main():
    # Initialize CPU measurement
    psutil.cpu_percent(interval=None)

    try:
        while True:

            if current_page == PAGE_SYSTEM:
                display_system()

            else:
                display_ip()

            time.sleep(UPDATE_INTERVAL)

    except KeyboardInterrupt:
        print("Stopping OLED monitor...")

    finally:
        device.clear()
        button.close()


# ============================================================
# Run
# ============================================================

if __name__ == "__main__":
    main()