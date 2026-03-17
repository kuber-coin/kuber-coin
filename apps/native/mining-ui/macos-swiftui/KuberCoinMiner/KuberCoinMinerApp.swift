import SwiftUI

enum KuberTheme {
    static let background = Color(red: 6 / 255, green: 8 / 255, blue: 22 / 255)
    static let surface = Color(red: 20 / 255, green: 30 / 255, blue: 57 / 255)
    static let surfaceStrong = Color(red: 11 / 255, green: 16 / 255, blue: 32 / 255)
    static let border = Color(red: 43 / 255, green: 58 / 255, blue: 105 / 255)
    static let accent = Color(red: 98 / 255, green: 126 / 255, blue: 234 / 255)
    static let accentSoft = Color(red: 89 / 255, green: 211 / 255, blue: 255 / 255)
    static let text = Color(red: 231 / 255, green: 236 / 255, blue: 255 / 255)
    static let muted = Color(red: 154 / 255, green: 169 / 255, blue: 214 / 255)
}

@main
struct KuberCoinMinerApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.dark)
        }
        .commands {
            CommandGroup(replacing: .newItem, addition: { })
        }
    }
}
