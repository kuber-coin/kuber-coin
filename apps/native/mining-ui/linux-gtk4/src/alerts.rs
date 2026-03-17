use gtk4::prelude::*;
use gtk4::{
    Box as GtkBox, Button, CheckButton, ComboBoxText, Entry, Frame, InfoBar, Label, ListBox,
    Orientation, ScrolledWindow, Switch,
};

pub fn create_view() -> ScrolledWindow {
    let scrolled = ScrolledWindow::builder()
        .hscrollbar_policy(gtk4::PolicyType::Never)
        .vscrollbar_policy(gtk4::PolicyType::Automatic)
        .build();

    let main_box = GtkBox::new(Orientation::Vertical, 24);
    main_box.set_margin_top(24);
    main_box.set_margin_bottom(24);
    main_box.set_margin_start(24);
    main_box.set_margin_end(24);

    // Header
    let header = GtkBox::new(Orientation::Horizontal, 12);
    let title = Label::new(Some("Alert Configuration"));
    title.set_markup("<span weight='bold' size='xx-large'>Alert Configuration</span>");
    title.set_halign(gtk4::Align::Start);
    header.append(&title);
    header.set_hexpand(true);

    let add_btn = Button::with_label("➕ Add Alert");
    add_btn.add_css_class("suggested-action");
    header.append(&add_btn);

    main_box.append(&header);

    // Global Settings Card
    main_box.append(&create_global_settings());

    // Alert Rules Title
    let rules_title = Label::new(Some("Alert Rules"));
    rules_title.set_markup("<span weight='bold' size='large'>Alert Rules</span>");
    rules_title.set_halign(gtk4::Align::Start);
    main_box.append(&rules_title);

    // Alert Rules
    let rules = vec![
        ("🌡", "GPU Temperature Warning", "Alert when GPU temperature exceeds safe threshold", "Greater than", "75°C", "2 hours ago", "#f59e0b"),
        ("⚠", "Hashrate Drop", "Alert when hashrate drops significantly", "Less than", "450 MH/s", "Never", "#ef4444"),
        ("⚡", "GPU Offline", "Alert when GPU becomes unresponsive", "Equals", "Offline", "Never", "#ef4444"),
        ("🔋", "High Power Consumption", "Alert when total power exceeds limit", "Greater than", "900W", "5 days ago", "#f59e0b"),
        ("🌐", "Pool Connection Lost", "Alert when pool connection is lost", "Equals", "Disconnected", "Yesterday", "#f59e0b"),
    ];

    for (icon, name, desc, condition, threshold, last_triggered, color) in rules {
        let card = create_alert_rule_card(icon, name, desc, condition, threshold, last_triggered, color);
        main_box.append(&card);
    }

    // Recent Alerts Card
    main_box.append(&create_recent_alerts());

    scrolled.set_child(Some(&main_box));
    scrolled
}

fn create_global_settings() -> Frame {
    let card = Frame::new(None);
    card.add_css_class("card");

    let card_box = GtkBox::new(Orientation::Vertical, 16);
    card_box.set_margin_top(20);
    card_box.set_margin_bottom(20);
    card_box.set_margin_start(20);
    card_box.set_margin_end(20);

    let title = Label::new(Some("Global Settings"));
    title.set_markup("<span weight='bold' size='large'>Global Settings</span>");
    title.set_halign(gtk4::Align::Start);
    card_box.append(&title);

    let notif_check = CheckButton::with_label("Enable Desktop Notifications");
    notif_check.set_active(true);
    card_box.append(&notif_check);

    let sound_check = CheckButton::with_label("Play Sound on Alert");
    sound_check.set_active(true);
    card_box.append(&sound_check);

    let email_check = CheckButton::with_label("Send Email Alerts");
    email_check.set_active(false);
    card_box.append(&email_check);

    let email_box = GtkBox::new(Orientation::Vertical, 8);
    let email_label = Label::new(Some("Email Address"));
    email_label.set_halign(gtk4::Align::Start);
    email_box.append(&email_label);

    let email_entry = Entry::new();
    email_entry.set_placeholder_text(Some("your@email.com"));
    email_box.append(&email_entry);
    card_box.append(&email_box);

    let interval_box = GtkBox::new(Orientation::Vertical, 8);
    let interval_label = Label::new(Some("Alert Check Interval"));
    interval_label.set_halign(gtk4::Align::Start);
    interval_box.append(&interval_label);

    let interval_combo = ComboBoxText::new();
    interval_combo.append_text("Every 30 seconds");
    interval_combo.append_text("Every minute");
    interval_combo.append_text("Every 5 minutes");
    interval_combo.append_text("Every 15 minutes");
    interval_combo.set_active(Some(1));
    interval_box.append(&interval_combo);
    card_box.append(&interval_box);

    card.set_child(Some(&card_box));
    card
}

fn create_alert_rule_card(
    icon: &str,
    name: &str,
    desc: &str,
    condition: &str,
    threshold: &str,
    last_triggered: &str,
    color: &str,
) -> Frame {
    let card = Frame::new(None);
    card.add_css_class("card");

    let card_box = GtkBox::new(Orientation::Vertical, 16);
    card_box.set_margin_top(20);
    card_box.set_margin_bottom(20);
    card_box.set_margin_start(20);
    card_box.set_margin_end(20);

    // Header
    let header = GtkBox::new(Orientation::Horizontal, 12);

    let icon_label = Label::new(Some(icon));
    icon_label.set_markup(&format!("<span size='x-large' color='{}'>{}</span>", color, icon));
    header.append(&icon_label);

    let labels_box = GtkBox::new(Orientation::Vertical, 4);
    let name_label = Label::new(Some(name));
    name_label.set_markup(&format!("<span weight='bold'>{}</span>", name));
    name_label.set_halign(gtk4::Align::Start);
    labels_box.append(&name_label);

    let desc_label = Label::new(Some(desc));
    desc_label.add_css_class("metric-label");
    desc_label.set_halign(gtk4::Align::Start);
    labels_box.append(&desc_label);

    header.append(&labels_box);
    header.set_hexpand(true);

    let controls_box = GtkBox::new(Orientation::Horizontal, 8);
    let switch = Switch::new();
    switch.set_active(true);
    controls_box.append(&switch);

    let edit_btn = Button::with_label("✎");
    controls_box.append(&edit_btn);

    let delete_btn = Button::with_label("🗑");
    controls_box.append(&delete_btn);

    header.append(&controls_box);
    card_box.append(&header);

    // Configuration
    let config_box = GtkBox::new(Orientation::Horizontal, 24);
    config_box.set_homogeneous(true);

    config_box.append(&create_config_item("Condition", condition));
    config_box.append(&create_config_item("Threshold", threshold));
    config_box.append(&create_config_item("Last Triggered", last_triggered));

    card_box.append(&config_box);

    card.set_child(Some(&card_box));
    card
}

fn create_config_item(label: &str, value: &str) -> GtkBox {
    let item_box = GtkBox::new(Orientation::Vertical, 4);
    let label_widget = Label::new(Some(label));
    label_widget.add_css_class("metric-label");
    label_widget.set_halign(gtk4::Align::Start);
    item_box.append(&label_widget);

    let value_widget = Label::new(Some(value));
    value_widget.set_markup(&format!("<span weight='bold'>{}</span>", value));
    value_widget.set_halign(gtk4::Align::Start);
    item_box.append(&value_widget);

    item_box
}

fn create_recent_alerts() -> Frame {
    let card = Frame::new(None);
    card.add_css_class("card");

    let card_box = GtkBox::new(Orientation::Vertical, 16);
    card_box.set_margin_top(20);
    card_box.set_margin_bottom(20);
    card_box.set_margin_start(20);
    card_box.set_margin_end(20);

    let title = Label::new(Some("Recent Alerts"));
    title.set_markup("<span weight='bold' size='large'>Recent Alerts</span>");
    title.set_halign(gtk4::Align::Start);
    card_box.append(&title);

    let list_box = ListBox::new();
    list_box.set_selection_mode(gtk4::SelectionMode::None);

    let alerts = vec![
        ("GPU 1 Temperature High", "Temperature reached 76°C (threshold: 75°C)", "2 hours ago", "#f59e0b"),
        ("Pool Connection Restored", "Successfully reconnected to pool.kuber-coin.com", "5 hours ago", "#10b981"),
        ("GPU 2 Temperature High", "Temperature reached 77°C (threshold: 75°C)", "6 hours ago", "#f59e0b"),
    ];

    for (message, details, timestamp, color) in alerts {
        let alert_row = GtkBox::new(Orientation::Horizontal, 12);
        alert_row.set_margin_top(12);
        alert_row.set_margin_bottom(12);

        let icon = Label::new(Some("🔔"));
        icon.set_markup(&format!("<span color='{}'>🔔</span>", color));
        alert_row.append(&icon);

        let text_box = GtkBox::new(Orientation::Vertical, 4);
        let msg_label = Label::new(Some(message));
        msg_label.set_markup(&format!("<span weight='bold'>{}</span>", message));
        msg_label.set_halign(gtk4::Align::Start);
        text_box.append(&msg_label);

        let details_label = Label::new(Some(details));
        details_label.add_css_class("metric-label");
        details_label.set_halign(gtk4::Align::Start);
        text_box.append(&details_label);

        alert_row.append(&text_box);
        alert_row.set_hexpand(true);

        let time_label = Label::new(Some(timestamp));
        time_label.add_css_class("metric-label");
        time_label.set_valign(gtk4::Align::Center);
        alert_row.append(&time_label);

        list_box.append(&alert_row);
    }

    card_box.append(&list_box);

    card.set_child(Some(&card_box));
    card
}
