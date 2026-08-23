import Foundation

/// The one contract between the app and its Share Extension.
///
/// They are separate processes and share nothing except the App Group
/// container, so the queue of shared screenshots is just a folder in there.
/// Add this file to *both* targets.
enum InspoShared {
    /// Must match the App Group configured on both targets.
    static let appGroupId = "group.com.zaremy.inspo"

    /// Folder inside the group container holding screenshots awaiting tagging.
    static let queueFolderName = "SharedCaptures"

    /// URL the extension opens to bring the app forward on the capture sheet.
    static let hostAppURL = "inspo://shared"

    /// Sidecar file holding a shared page's serialized DOM, named after the
    /// image it belongs to.
    static let snapshotExtension = "inspodom"

    /// Sidecar holding the tags chosen in the share sheet, named after the
    /// image it belongs to. Present when the extension did the tagging, absent
    /// when the capture still needs the sheet inside the app.
    static let tagsExtension = "inspotags"

    /// The app's tag vocabulary, mirrored here so the extension can offer the
    /// same pickers. The library itself lives in IndexedDB inside the app's
    /// webview, which another process cannot read.
    static let vocabularyFileName = "vocabulary.json"

    static func queueDirectory() -> URL? {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupId
        ) else { return nil }

        let directory = container.appendingPathComponent(queueFolderName, isDirectory: true)
        if !FileManager.default.fileExists(atPath: directory.path) {
            try? FileManager.default.createDirectory(
                at: directory,
                withIntermediateDirectories: true
            )
        }
        return directory
    }

    /// Lives beside the queue folder rather than inside it, because everything
    /// inside the queue is treated as shared material.
    static func vocabularyURL() -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupId)?
            .appendingPathComponent(vocabularyFileName)
    }

    /// Extensions that are sidecars rather than shared images.
    static let sidecarExtensions: Set<String> = [snapshotExtension, tagsExtension]

    static func mimeType(forExtension ext: String) -> String {
        switch ext.lowercased() {
        case "jpg", "jpeg": return "image/jpeg"
        case "heic": return "image/heic"
        case "heif": return "image/heif"
        case "webp": return "image/webp"
        case "gif": return "image/gif"
        default: return "image/png"
        }
    }
}
