mod dashboard;
mod devices;
mod overclocking;
mod pools;
mod charts;
mod alerts;
mod models;
mod services;

use gtk4::prelude::*;
use gtk4::{glib, Application, ApplicationWindow, Box as GtkBox, Orientation, Stack, StackSidebar};
use libadwaita as adw;
use adw::prelude::*;

const APP_ID: &str = "com.kubercoin.miner";

fn main() -> glib::ExitCode {
    let app = Application::builder()
        .application_id(APP_ID)
        .build();

    app.connect_activate(build_ui);
    app.run()
}

fn build_ui(app: &Application) {
    // Initialize libadwaita
    adw::init().expect("Failed to initialize libadwaita");

    // Create main window
    let window = ApplicationWindow::builder()
        .application(app)
        .title("KuberCoin Miner")
        .default_width(1200)
        .default_height(800)
        .build();

    // Create main container
    let main_box = GtkBox::new(Orientation::Horizontal, 0);

    // Create stack for different views
    let stack = Stack::builder()
        .transition_type(gtk4::StackTransitionType::SlideLeftRight)
        .build();

    // Add views to stack
    stack.add_titled(&dashboard::create_view(), Some("dashboard"), "Dashboard");
    stack.add_titled(&devices::create_view(), Some("devices"), "Devices");
    stack.add_titled(&pools::create_view(), Some("pools"), "Pools");
    stack.add_titled(&overclocking::create_view(), Some("overclocking"), "Overclocking");
    stack.add_titled(&charts::create_view(), Some("charts"), "Charts");
    stack.add_titled(&alerts::create_view(), Some("alerts"), "Alerts");

    // Create sidebar
    let sidebar = StackSidebar::new();
    sidebar.set_stack(&stack);

    // Apply styling
    let sidebar_box = GtkBox::new(Orientation::Vertical, 0);
    sidebar_box.append(&sidebar);
    sidebar_box.set_width_request(200);
    sidebar_box.add_css_class("sidebar");

    // Add to main box
    main_box.append(&sidebar_box);
    main_box.append(&stack);
    stack.set_hexpand(true);

    window.set_child(Some(&main_box));

    // Load custom CSS
    load_css();

    window.present();
}

fn load_css() {
    let provider = gtk4::CssProvider::new();
    provider.load_from_data(
        r#"
        .sidebar {
            background-color: #0b1020;
            border-right: 1px solid #24325b;
        }
        
        .card {
            background: linear-gradient(180deg, rgba(20, 30, 57, 0.96), rgba(12, 18, 37, 0.96));
            border: 1px solid #2b3a69;
            border-radius: 14px;
            padding: 20px;
            margin: 12px;
            box-shadow: 0 16px 42px rgba(2, 6, 20, 0.45);
        }
        
        .metric-number {
            font-size: 48px;
            font-weight: bold;
            color: #e7ecff;
        }
        
        .metric-label {
            font-size: 14px;
            color: #9aa9d6;
        }
        
        .brand-orange {
            color: #627eea;
        }
        
        .mining-button {
            min-width: 120px;
            min-height: 120px;
            border-radius: 60px;
            border: 3px solid #627eea;
            background: radial-gradient(circle at 30% 30%, rgba(98, 126, 234, 0.2), rgba(10, 14, 28, 0.96));
            color: #e7ecff;
        }
        
        .temperature-normal {
            color: #10b981;
        }
        
        .temperature-warning {
            color: #f59e0b;
        }
        
        .temperature-critical {
            color: #ef4444;
        }

        window,
        box,
        stack,
        label {
            color: #e7ecff;
        }
        "#,
    );

    gtk4::style_context_add_provider_for_display(
        &gtk4::gdk::Display::default().expect("Could not connect to display"),
        &provider,
        gtk4::STYLE_PROVIDER_PRIORITY_APPLICATION,
    );
}
