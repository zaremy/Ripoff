import UIKit
import UniformTypeIdentifiers

/// The Share Extension, and where tagging actually happens.
///
/// It used to have no UI at all: the extension queued the screenshot and asked
/// iOS to open Inspo, where the capture sheet was. iOS no longer reliably
/// grants that request - on iOS 26 it simply refuses - so the share looked like
/// it had failed. The material was safely queued and the user had no way to
/// know it.
///
/// So the sheet comes here instead. You stay in whatever app you were reading,
/// tag in place, and the extension dismisses. Nothing switches.
///
/// The catch is that the tag vocabulary lives in IndexedDB inside the app's
/// webview, which this process cannot read. The app mirrors it into the App
/// Group (see `InspoShared.vocabularyURL`) and this reads that copy.
///
/// Add this file to **both** Share Extension targets.
class ShareViewController: UIViewController {
    private var material = SharedMaterial()
    private var vocabulary = Vocabulary.load()

    private let backdrop = UIImageView()
    private let backdropDim = UIView()
    private let card = UIView()
    private let thumbnail = UIImageView()
    private let caption = UILabel()
    private let sourceField = UITextField()
    private let relevantField = UITextField()
    private let saveButton = UIButton(type: .system)
    private var sourceChips = UIStackView()
    private var relevantChips = UIStackView()

    /// Loading runs on arbitrary queues; this keeps the writes to `material`
    /// from racing each other.
    private let materialQueue = DispatchQueue(label: "com.zaremy.inspo.material")

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.black.withAlphaComponent(0.35)
        buildInterface()
        loadSharedItems()
    }

    // MARK: - Interface

    private func buildInterface() {
        // The screenshot itself sits behind the sheet, so you can see what you
        // are tagging rather than a grey rectangle. Dimmed only once there is
        // actually an image, or a page-only share would darken twice.
        backdrop.contentMode = .scaleAspectFill
        backdrop.clipsToBounds = true
        backdrop.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(backdrop)

        backdropDim.backgroundColor = UIColor.black.withAlphaComponent(0.3)
        backdropDim.alpha = 0
        backdropDim.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(backdropDim)

        for filler in [backdrop, backdropDim] {
            NSLayoutConstraint.activate([
                filler.topAnchor.constraint(equalTo: view.topAnchor),
                filler.bottomAnchor.constraint(equalTo: view.bottomAnchor),
                filler.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                filler.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            ])
        }

        card.backgroundColor = .systemBackground
        card.layer.cornerRadius = 20
        card.layer.cornerCurve = .continuous
        card.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(card)

        let title = UILabel()
        title.text = "New reference"
        title.font = .preferredFont(forTextStyle: .headline)

        thumbnail.contentMode = .scaleAspectFill
        thumbnail.clipsToBounds = true
        thumbnail.layer.cornerRadius = 10
        thumbnail.backgroundColor = .secondarySystemBackground
        thumbnail.translatesAutoresizingMaskIntoConstraints = false
        thumbnail.widthAnchor.constraint(equalToConstant: 56).isActive = true
        thumbnail.heightAnchor.constraint(equalToConstant: 56).isActive = true

        caption.font = .preferredFont(forTextStyle: .footnote)
        caption.textColor = .secondaryLabel
        caption.numberOfLines = 2
        caption.text = "Getting the screenshot…"

        let heading = UIStackView(arrangedSubviews: [thumbnail, stacked([title, caption], spacing: 2)])
        heading.spacing = 12
        heading.alignment = .center

        sourceField.placeholder = "Which product is this?"
        relevantField.placeholder = "Which idea could this help?"
        for field in [sourceField, relevantField] {
            field.borderStyle = .roundedRect
            field.autocapitalizationType = .words
            field.autocorrectionType = .no
            field.clearButtonMode = .whileEditing
            field.returnKeyType = .done
            field.delegate = self
        }
        sourceField.text = vocabulary.lastSource
        relevantField.text = vocabulary.lastRelevantTo.first ?? ""

        sourceChips = chipRow(vocabulary.sources, action: #selector(pickSource(_:)))
        relevantChips = chipRow(vocabulary.relevantTo, action: #selector(pickRelevant(_:)))

        let cancel = UIButton(type: .system)
        cancel.setTitle("Discard", for: .normal)
        cancel.addTarget(self, action: #selector(discard), for: .touchUpInside)

        saveButton.setTitle("Save", for: .normal)
        saveButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        saveButton.addTarget(self, action: #selector(save), for: .touchUpInside)
        // Nothing to save until the bytes have actually arrived.
        saveButton.isEnabled = false

        let actions = UIStackView(arrangedSubviews: [cancel, UIView(), saveButton])
        actions.spacing = 12
        actions.alignment = .center

        let form = stacked(
            [
                heading,
                label("FROM"), sourceField, scrolling(sourceChips),
                label("FOR"), relevantField, scrolling(relevantChips),
                actions,
            ],
            spacing: 10
        )
        form.setCustomSpacing(18, after: heading)
        form.setCustomSpacing(18, after: scrolling(sourceChips))
        form.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(form)

        NSLayoutConstraint.activate([
            card.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
            card.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
            card.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -12),
            form.topAnchor.constraint(equalTo: card.topAnchor, constant: 18),
            form.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 18),
            form.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -18),
            form.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -18),
        ])
    }

    private func label(_ text: String) -> UILabel {
        let view = UILabel()
        view.text = text
        view.font = .preferredFont(forTextStyle: .caption1)
        view.textColor = .secondaryLabel
        return view
    }

    private func stacked(_ views: [UIView], spacing: CGFloat) -> UIStackView {
        let stack = UIStackView(arrangedSubviews: views)
        stack.axis = .vertical
        stack.spacing = spacing
        return stack
    }

    /// Recently used tags, so the common capture is one tap rather than typing.
    private func chipRow(_ tags: [String], action: Selector) -> UIStackView {
        let stack = UIStackView()
        stack.spacing = 8
        for tag in tags.prefix(8) {
            let chip = UIButton(type: .system)
            chip.setTitle(tag, for: .normal)
            chip.titleLabel?.font = .preferredFont(forTextStyle: .subheadline)
            chip.contentEdgeInsets = UIEdgeInsets(top: 6, left: 12, bottom: 6, right: 12)
            chip.backgroundColor = .secondarySystemBackground
            chip.layer.cornerRadius = 14
            chip.addTarget(self, action: action, for: .touchUpInside)
            stack.addArrangedSubview(chip)
        }
        return stack
    }

    private var scrollers: [ObjectIdentifier: UIScrollView] = [:]

    private func scrolling(_ stack: UIStackView) -> UIScrollView {
        if let existing = scrollers[ObjectIdentifier(stack)] { return existing }
        let scroll = UIScrollView()
        scroll.showsHorizontalScrollIndicator = false
        scroll.translatesAutoresizingMaskIntoConstraints = false
        stack.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: scroll.topAnchor),
            stack.bottomAnchor.constraint(equalTo: scroll.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: scroll.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: scroll.trailingAnchor),
            scroll.heightAnchor.constraint(equalTo: stack.heightAnchor),
        ])
        scrollers[ObjectIdentifier(stack)] = scroll
        return scroll
    }

    @objc private func pickSource(_ sender: UIButton) {
        sourceField.text = sender.title(for: .normal)
    }

    @objc private func pickRelevant(_ sender: UIButton) {
        relevantField.text = sender.title(for: .normal)
    }

    // MARK: - Loading

    private func loadSharedItems() {
        let attachments = (extensionContext?.inputItems as? [NSExtensionItem] ?? [])
            .flatMap { $0.attachments ?? [] }

        let images = attachments.filter { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }
        let pages = attachments.filter { $0.hasItemConformingToTypeIdentifier(UTType.propertyList.identifier) }

        guard !images.isEmpty || !pages.isEmpty else {
            finish()
            return
        }

        let group = DispatchGroup()

        for attachment in pages {
            group.enter()
            attachment.loadItem(forTypeIdentifier: UTType.propertyList.identifier, options: nil) { [weak self] item, _ in
                defer { group.leave() }
                guard
                    let dictionary = item as? NSDictionary,
                    let results = dictionary[NSExtensionJavaScriptPreprocessingResultsKey] as? NSDictionary,
                    let serialized = results["snapshot"] as? String
                else { return }
                self?.materialQueue.sync { self?.material.snapshot = serialized }
            }
        }

        // Only the first image is tagged here; a multi-image share still queues
        // every one, and the extras are tagged in the app.
        for attachment in images.prefix(1) {
            group.enter()
            attachment.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { [weak self] item, _ in
                defer { group.leave() }
                let (data, ext) = Self.imageData(from: item)
                self?.materialQueue.sync {
                    self?.material.imageData = data
                    self?.material.imageExtension = ext
                }
            }
        }

        group.notify(queue: .main) { [weak self] in
            guard let self else { return }
            self.saveButton.isEnabled = true
            if let data = self.material.imageData, let image = UIImage(data: data) {
                self.thumbnail.image = image
                self.backdrop.image = image
                self.backdropDim.alpha = 1
                self.caption.text = "Tag it with the product it came from and the idea it might help."
            } else if self.material.snapshot != nil {
                self.caption.text = "Page markup captured. Its cover is drawn on save."
            } else {
                self.caption.text = "Nothing usable arrived in this share."
                self.saveButton.isEnabled = false
            }
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

    // MARK: - Finishing

    @objc private func save() {
        let source = sourceField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let relevant = relevantField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        // Tags are optional here: an untagged share is still worth keeping, and
        // the app's own capture sheet will ask for them on next open.
        let tags: [String: Any]? = (source.isEmpty && relevant.isEmpty)
            ? nil
            : ["source": source, "relevant_to": relevant.isEmpty ? [] : [relevant]]

        write(tags: tags)
        finish()
    }

    @objc private func discard() {
        extensionContext?.cancelRequest(withError: NSError(domain: "com.zaremy.inspo", code: 0))
    }

    /// One queued share is one file, plus the sidecars describing it.
    private func write(tags: [String: Any]?) {
        guard let directory = InspoShared.queueDirectory() else { return }
        let (imageData, imageExtension, snapshot) = materialQueue.sync {
            (material.imageData, material.imageExtension, material.snapshot)
        }
        guard imageData != nil || snapshot != nil else { return }

        let id = UUID().uuidString
        let base = directory.appendingPathComponent(id)

        // Sidecars first: an image with no sidecar is a valid share, but a
        // sidecar the app never sees is a silently lost snapshot.
        if let snapshot, let data = snapshot.data(using: .utf8) {
            try? data.write(to: base.appendingPathExtension(InspoShared.snapshotExtension), options: .atomic)
        }
        if let tags, let data = try? JSONSerialization.data(withJSONObject: tags) {
            try? data.write(to: base.appendingPathExtension(InspoShared.tagsExtension), options: .atomic)
        }
        if let imageData {
            try? imageData.write(
                to: base.appendingPathExtension(imageExtension ?? "png"),
                options: .atomic
            )
        }
    }

    private func finish() {
        extensionContext?.completeRequest(returningItems: nil)
    }
}

extension ShareViewController: UITextFieldDelegate {
    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        textField.resignFirstResponder()
        return true
    }
}

/// What the share actually carried.
private struct SharedMaterial {
    var imageData: Data?
    var imageExtension: String?
    var snapshot: String?
}

/// The app's tags, mirrored into the App Group for this process to read.
private struct Vocabulary: Decodable {
    var sources: [String] = []
    var relevantTo: [String] = []
    var lastSource: String = ""
    var lastRelevantTo: [String] = []

    static func load() -> Vocabulary {
        guard
            let url = InspoShared.vocabularyURL(),
            let data = try? Data(contentsOf: url),
            let decoded = try? JSONDecoder().decode(Vocabulary.self, from: data)
        else { return Vocabulary() }
        return decoded
    }
}
