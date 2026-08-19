import UIKit
import UniformTypeIdentifiers

/// The Share Extension. It has no UI of its own on purpose.
///
/// Tagging happens in the app, where the library already lives, so the
/// extension's only job is to get the bytes into the App Group container and
/// bring Inspo forward. That keeps one source of truth for captures and makes
/// the share itself instant.
///
/// Add this file to the **Share Extension** target only.
class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        handleSharedItems()
    }

    private func handleSharedItems() {
        let attachments = (extensionContext?.inputItems as? [NSExtensionItem] ?? [])
            .flatMap { $0.attachments ?? [] }
            .filter { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }

        guard !attachments.isEmpty else {
            finish()
            return
        }

        let group = DispatchGroup()
        for attachment in attachments {
            group.enter()
            attachment.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { item, _ in
                defer { group.leave() }
                self.enqueue(item)
            }
        }

        group.notify(queue: .main) { [weak self] in
            self?.finish()
        }
    }

    /// Shared items arrive either as a file URL, as raw Data, or as a UIImage.
    private func enqueue(_ item: NSSecureCoding?) {
        guard let directory = InspoShared.queueDirectory() else { return }

        var payload: Data?
        var ext = "png"

        switch item {
        case let url as URL:
            payload = try? Data(contentsOf: url)
            if !url.pathExtension.isEmpty { ext = url.pathExtension }
        case let data as Data:
            payload = data
        case let image as UIImage:
            payload = image.pngData()
        default:
            return
        }

        guard let data = payload else { return }
        let destination = directory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension(ext)
        try? data.write(to: destination, options: .atomic)
    }

    private func finish() {
        // Complete only after the open attempt has resolved: tearing the
        // extension down first cancels it.
        openHostApp { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }
    }

    /// Share extensions cannot reach UIApplication directly, so ask the
    /// extension context first and fall back to walking the responder chain.
    /// If neither works the screenshot still waits in the queue and the app
    /// picks it up the next time it is opened.
    private func openHostApp(completion: @escaping () -> Void) {
        guard let url = URL(string: InspoShared.hostAppURL) else {
            completion()
            return
        }

        extensionContext?.open(url) { [weak self] opened in
            if !opened { self?.openViaResponderChain(url) }
            completion()
        }
    }

    /// `UIApplication.open` is unavailable to extensions at compile time, so
    /// reach it through a dynamic selector instead.
    private func openViaResponderChain(_ url: URL) {
        let selector = NSSelectorFromString("openURL:")
        var responder: UIResponder? = self
        while let current = responder {
            if current.responds(to: selector) {
                _ = current.perform(selector, with: url)
                return
            }
            responder = current.next
        }
    }
}
