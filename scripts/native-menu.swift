import AppKit
import Darwin

// AppKit owns the status item. Electron remains the sole timer/storage owner.
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let parentPID = pid_t(CommandLine.arguments[2])!
let testMode = ProcessInfo.processInfo.environment["FOCUS_BUDDY_E2E"] == "1"
let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
guard let button = item.button, let icon = NSImage(contentsOfFile: CommandLine.arguments[1]) else {
    fputs("Focus Buddy: native menu icon could not be loaded\n", stderr)
    exit(1)
}
icon.size = NSSize(width: 18, height: 18)
icon.isTemplate = true
button.image = icon
button.imagePosition = .imageLeft
button.font = NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .regular)
button.alignment = .center
button.title = "25:00"
button.toolTip = "Focus Buddy"
func frameImage(_ path: String) -> NSImage? {
    let image = NSImage(size: NSSize(width:18,height:18))
    for filename in [path, path.replacingOccurrences(of: ".png", with: "@2x.png")] {
        if let data = try? Data(contentsOf: URL(fileURLWithPath:filename)), let rep = NSBitmapImageRep(data:data) {
            rep.size = NSSize(width:18,height:18); image.addRepresentation(rep)
        }
    }
    guard !image.representations.isEmpty else { return nil }
    image.isTemplate = true; return image
}
let frameDirectory = URL(fileURLWithPath:CommandLine.arguments[1]).deletingLastPathComponent().appendingPathComponent("menu-cat")
let sleepFrames = (0..<4).compactMap { frameImage(frameDirectory.appendingPathComponent("sleep-\($0).png").path) }
let restFrames = (0..<4).compactMap { frameImage(frameDirectory.appendingPathComponent("rest-\($0).png").path) }
if let initial = sleepFrames.first { button.image = initial }
@MainActor final class MenuAnimation {
 let button: NSStatusBarButton
 let sleep: [NSImage]
 let rest: [NSImage]
 var timer: Timer? = nil
 var mode = "sleep"
 var frame = 0
 var changes = 0
 var signature: Data?
 init(button:NSStatusBarButton,sleep:[NSImage],rest:[NSImage]) { self.button=button;self.sleep=sleep;self.rest=rest;signature=button.image?.tiffRepresentation }
 func stop() { timer?.invalidate(); timer = nil }
 func update(status: String, phase: String) {
    guard status != "paused" else { stop(); return }
    let nextMode = phase == "focus" ? "sleep" : "rest"
    if timer != nil && nextMode == mode { return }
    stop()
    if mode != nextMode { frame = 0 }
    mode = nextMode
    scheduleNext()
 }
 func scheduleNext() {
    let frames = mode == "sleep" ? sleep : rest
    let delays: [TimeInterval] = [4.6,0.1,0.1,0.2]
    guard frames.count == 4 else { return }
    timer = Timer.scheduledTimer(withTimeInterval:delays[frame],repeats:false) { [weak self] _ in
        MainActor.assumeIsolated {
            guard let self else { return }
            self.frame = (self.frame+1)%frames.count
            let next = frames[self.frame]
            // Do not reassign identical frames: no blank frame or item recreation.
            let signature = next.tiffRepresentation
            if self.signature != signature { self.button.image = next; self.signature = signature; self.changes += 1 }
            self.scheduleNext()
        }
    }
}
}
let animation = MainActor.assumeIsolated { MenuAnimation(button:button,sleep:sleepFrames,rest:restFrames) }
@MainActor func stopAnimation() { animation.stop() }
@Sendable func emit(_ value: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: value), let line = String(data: data, encoding: .utf8) else { return }
    print(line); fflush(stdout)
}
@MainActor func diagnostic() {
    let rect = button.window?.convertToScreen(button.convert(button.bounds, to: nil)) ?? .zero
    emit(["type": "diagnostic", "pid": ProcessInfo.processInfo.processIdentifier,
          "visible": item.isVisible, "title": button.title,
          "bounds": ["x": rect.minX, "y": rect.minY, "width": rect.width, "height": rect.height],
          "imageSize": ["width": icon.size.width, "height": icon.size.height]])
    emit(["type":"animation", "frame":animation.frame,"changes":animation.changes,"running":animation.timer != nil,"mode":animation.mode,"frames":sleepFrames.count,"retinaRepresentations":button.image?.representations.count ?? 0])
}
class MenuActions: NSObject {
    @objc func select(_ sender: NSMenuItem) { emit(["type": "action", "id": sender.tag]) }
}
let actions = MenuActions()
var menuSignature = ""
@MainActor func receive(_ message: [String: Any]) {
    switch message["type"] as? String {
    case "update":
        animation.update(status:message["status"] as? String ?? "idle", phase:message["phase"] as? String ?? "focus")
        button.title = message["title"] as? String ?? "25:00"
        button.toolTip = message["tooltip"] as? String ?? "Focus Buddy"
        if let rows = message["items"] as? [[String: Any]] {
            let signature = String(data: (try? JSONSerialization.data(withJSONObject: Array(rows.dropFirst()))) ?? Data(), encoding: .utf8) ?? ""
            if signature != menuSignature {
                menuSignature = signature
                let menu = NSMenu()
                menu.autoenablesItems = false
                for row in rows {
                    let entry = NSMenuItem(title: row["label"] as? String ?? "", action: #selector(MenuActions.select(_:)), keyEquivalent: "")
                    entry.target = actions; entry.tag = row["id"] as? Int ?? -1
                    entry.isEnabled = row["enabled"] as? Bool ?? false
                    menu.addItem(entry)
                }
                item.menu = menu
            } else {
                item.menu?.items.first?.title = rows.first?["label"] as? String ?? "Focus Buddy"
            }
        }
        diagnostic()
    case "testAction" where testMode:
        if let id = message["id"] as? Int, let menu = item.menu,
           let index = menu.items.firstIndex(where: { $0.tag == id && $0.isEnabled }) {
            menu.performActionForItem(at: index)
        }
    case "testOpen" where testMode:
        item.menu?.popUp(positioning: nil, at: NSPoint(x: 0, y: button.bounds.minY), in: button)
    case "testAppearance" where testMode:
        button.appearance = NSAppearance(named:message["value"] as? String == "light" ? .aqua : .darkAqua)
        button.needsDisplay = true
    case "quit": stopAnimation(); NSStatusBar.system.removeStatusItem(item); app.terminate(nil)
    default: break
    }
}
DispatchQueue.global(qos: .utility).async {
    while let line = readLine() {
        guard let data = line.data(using: .utf8), let message = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
        DispatchQueue.main.async { receive(message) }
    }
    DispatchQueue.main.async { stopAnimation(); NSStatusBar.system.removeStatusItem(item); app.terminate(nil) }
}
Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { _ in
    if kill(parentPID, 0) != 0 { NSStatusBar.system.removeStatusItem(item); app.terminate(nil) }
}
Timer.scheduledTimer(withTimeInterval: 0.5, repeats: false) { _ in MainActor.assumeIsolated { diagnostic() } }
app.run()
