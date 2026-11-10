import { expect, it, vi } from "vitest";
import { desktopDeviceIdRead } from "./desktopDeviceId";

function storageCreate(): Pick<Storage, "getItem" | "setItem"> {
    const values = new Map<string, string>();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => void values.set(key, value),
    };
}

it("makes the device ID once and names the same device on every later launch", () => {
    const storage = storageCreate();
    const create = vi
        .fn<() => string>()
        .mockReturnValueOnce("6f1c1e9e-2f1a-4a43-9a52-0d7f0b6a3c11")
        .mockReturnValueOnce("a-second-id");
    const first = desktopDeviceIdRead(storage, create);
    const relaunched = desktopDeviceIdRead(storage, create);
    expect(first).toBe("6f1c1e9e-2f1a-4a43-9a52-0d7f0b6a3c11");
    expect(relaunched).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
});

it("replaces a stored ID the daemon would refuse", () => {
    const storage = storageCreate();
    storage.setItem("happy.device-id.v1", "not a device id!");
    expect(desktopDeviceIdRead(storage, () => "fresh-id")).toBe("fresh-id");
    expect(desktopDeviceIdRead(storage, () => "another-id")).toBe("fresh-id");
});
