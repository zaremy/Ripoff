import UIKit
import UniformTypeIdentifiers

/// The Share Extension. It has no UI of its own on purpose.
///
/// Tagging happens in the app, where the library already lives, so the
/// extension's only job is to get the shared material into the App Group
/// container and bring Inspo forward. That keeps one source of truth for
/// captures and makes the share itself instant.
///
/// One class, two extensions. Whether a DOM exists is not something iOS lets
/// the app decide - a screenshot carries pixels and no DOM, a page shared from
/// Safari carries the serialized DOM and no pixels - so rather than guessing
/// from whatever happened to be attached, Inspo ships two share entries and
/// lets the share sheet ask:
///
///   Inspo       - images, any app.        -> pixels
///   Inspo Page  - web pages, Safari only. -> DOM via share-preprocess.js
///
/// Both write into the same queue, and this controller handles either shape,
/// including the case where a single share somehow carries both.
///
/// Add this file to **both** Share Extension targets.
class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        handleSharedItems()
    }

    private func handleSharedItems() {
        let attachments = (extensionContext?.inputItems as? [NSExtensionItem] ?? [])
            .flatMap { $0.attachments ?? [] }

        let images = attachments.filter { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }
        let pages = attachments.filter { $0.hasItemConformingToTypeIdentifier(UTType.propertyList.identifier) }

        guard !images.isEmpty || !pages.isEmpty else {
            finish()
            return
        }

        let group = DispatchGroup()
        // A page shared alongside an image belongs to that image.
        var snapshot: String?

        for attachment in pages {
            group.enter()
            attachment.loadItem(forTypeIdentifier: UTType.propertyList.identifier, options: nil) { item, _ in
                defer { group.leave() }
                guard
                    let dictionary = item as? NSDictionary,
                    let results = dictionary[NSExtensionJavaScriptPreprocessingResultsKey] as? NSDictionary,
                    let serialized = results["snapshot"] as? String
                else { return }
                snapshot = serialized
            }
        }

        group.notify(queue: .global(qos: .userInitiated)) { [weak self] in
            guard let self else { return }

            if images.isEmpty {
                // Page-only share: queue the markup on its own.
                self.write(imageData: nil, extension: nil, snapshot: snapshot)
                DispatchQueue.main.async { self.finish() }
                return
            }

            let imageGroup = DispatchGroup()
            for attachment in images {
                imageGroup.enter()
                attachment.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { item, _ in
                    defer { imageGroup.leave() }
                    let (data, ext) = Self.imageData(from: item)
                    guard let data else { return }
                    self.write(imageData: data, extension: ext, snapshot: snapshot)
                }
            }
            imageGroup.notify(queue: .main) { self.finish() }
        }
    }

    /// Shared images arrive either as a file URL, as raw Data, or as a UIImage.
    private static func imageData(from item: NSSecureCoding?) -> (Data?, String?) {
        switch item {
        case let url as URL:
            return (try? Data(contentsOf: url), url.pathExtension.isEmpty ? nil : url.pathExtension)
        case let data as Data:
            return (data, nil)
        case let image as UIImage:
            return (image.pngData(), "png")
        default:
            return (nil, nil)
        }
    }

    /// One queued share is one file, plus a sidecar holding its page markup.
    private func write(imageData: Data?, extension ext: String?, snapshot: String?) {
        guard let directory = InspoShared.queueDirectory() else { return }

        let id = UUID().uuidString
        if let imageData {
            let destination = directory
                .appendingPathComponent(id)
                .appendingPathExtension(ext ?? "png")
            try? imageData.write(to: destination, options: .atomic)
        }

        if let snapshot, let data = snapshot.data(using: .utf8) {
            let sidecar = directory
                .appendingPathComponent(id)
                .appendingPathExtension(InspoShared.snapshotExtension)
            try? data.write(to: sidecar, options: .atomic)
        }
    }

    private func finish() {
        // Complete only after the open attempt has resolved: tearing the
        // extension down first cancels it.
        openHostApp { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }
    }

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
