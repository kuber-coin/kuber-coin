use gtk4::prelude::*;
use gtk4::{Box as GtkBox, Button, ComboBoxText, Entry, Expander, Frame, Grid, Label, Orientation, ScrolledWindow, Switch};

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
    let title = Label::new(Some("Mining Pools"));
    title.set_markup("<span weight='bold' size='xx-large'>Mining Pools</span>");
    title.set_halign(gtk4::Align::Start);
    header.append(&title);
    header.set_hexpand(true);

    let add_btn = Button::with_label("➕ Add Pool");
    add_btn.add_css_class("suggested-action");
    header.append(&add_btn);

    main_box.append(&header);

    // Pool Cards
    let pools = vec![
        ("KuberCoin Official", "pool.kuber-coin.com:3333", "Connected", 15243, 12, "23h 45m", "rig001"),
        ("Backup Pool", "pool2.kuber-coin.com:3333", "Standby", 0, 0, "0h 0m", "rig001"),
    ];

    for (name, url, status, accepted, rejected, uptime, worker) in pools {
        let card = create_pool_card(name, url, status, accepted, rejected, uptime, worker);
        main_box.append(&card);
    }

    scrolled.set_child(Some(&main_box));
    scrolled
}

fn create_pool_card(
    name: &str,
    url: &str,
    status: &str,
    accepted: i32,
    rejected: i32,
    uptime: &str,
    worker: &str,
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

    let status_indicator = Label::new(Some("●"));
    if status == "Connected" {
        status_indicator.set_markup("<span color='#10b981' size='large'>●</span>");
    } else {
        status_indicator.set_markup("<span color='#f59e0b' size='large'>●</span>");
    }
    header.append(&status_indicator);

    let labels_box = GtkBox::new(Orientation::Vertical, 4);
    let name_label = Label::new(Some(name));
    name_label.set_markup(&format!("<span weight='bold' size='large'>{}</span>", name));
    name_label.set_halign(gtk4::Align::Start);
    labels_box.append(&name_label);

    let url_label = Label::new(Some(url));
    url_label.add_css_class("metric-label");
    url_label.set_halign(gtk4::Align::Start);
    labels_box.append(&url_label);

    header.append(&labels_box);
    header.set_hexpand(true);

    let controls_box = GtkBox::new(Orientation::Horizontal, 8);
    let switch = Switch::new();
    switch.set_active(status == "Connected");
    controls_box.append(&switch);

    let edit_btn = Button::with_label("✎");
    controls_box.append(&edit_btn);

    let delete_btn = Button::with_label("🗑");
    controls_box.append(&delete_btn);

    header.append(&controls_box);
    card_box.append(&header);

    // Stats Grid
    let stats_grid = Grid::builder()
        .column_spacing(24)
        .row_spacing(8)
        .build();

    let stats = vec![
        ("Status", status.to_string()),
        ("Accepted Shares", accepted.to_string()),
        ("Rejected Shares", rejected.to_string()),
        ("Uptime", uptime.to_string()),
    ];

    for (i, (label, value)) in stats.iter().enumerate() {
        let metric_box = GtkBox::new(Orientation::Vertical, 4);
        let label_widget = Label::new(Some(label));
        label_widget.add_css_class("metric-label");
        label_widget.set_halign(gtk4::Align::Start);
        metric_box.append(&label_widget);

        let value_widget = Label::new(Some(value));
        value_widget.set_markup(&format!("<span weight='bold'>{}</span>", value));
        value_widget.set_halign(gtk4::Align::Start);
        metric_box.append(&value_widget);

        stats_grid.attach(&metric_box, i as i32, 0, 1, 1);
    }

    card_box.append(&stats_grid);

    // Configuration Expander
    let expander = Expander::with_label("Pool Configuration");
    let config_box = GtkBox::new(Orientation::Vertical, 16);
    config_box.set_margin_top(16);

    config_box.append(&create_entry("Worker Name", worker));
    config_box.append(&create_entry("Wallet Address", "KBR1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0"));

    let priority_box = GtkBox::new(Orientation::Vertical, 8);
    let priority_label = Label::new(Some("Priority"));
    priority_label.set_halign(gtk4::Align::Start);
    priority_box.append(&priority_label);

    let priority_combo = ComboBoxText::new();
    priority_combo.append_text("Primary");
    priority_combo.append_text("Failover 1");
    priority_combo.append_text("Failover 2");
    priority_combo.append_text("Failover 3");
    priority_combo.set_active(Some(0));
    priority_box.append(&priority_combo);
    config_box.append(&priority_box);

    expander.set_child(Some(&config_box));
    card_box.append(&expander);

    card.set_child(Some(&card_box));
    card
}

fn create_entry(label: &str, value: &str) -> GtkBox {
    let entry_box = GtkBox::new(Orientation::Vertical, 8);
    let label_widget = Label::new(Some(label));
    label_widget.set_halign(gtk4::Align::Start);
    entry_box.append(&label_widget);

    let entry = Entry::new();
    entry.set_text(value);
    entry_box.append(&entry);

    entry_box
}
