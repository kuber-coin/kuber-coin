use gtk4::prelude::*;
use gtk4::{Box as GtkBox, Button, Frame, Grid, Label, ListBox, Orientation, ProgressBar, ScrolledWindow};
use std::sync::{Arc, Mutex};

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

    // Mining Control Button
    let mining_control = create_mining_control();
    main_box.append(&mining_control);

    // Metrics Cards Row
    let metrics_row = create_metrics_cards();
    main_box.append(&metrics_row);

    // Unpaid Balance Card
    let balance_card = create_balance_card();
    main_box.append(&balance_card);

    // Device List Card
    let devices_card = create_devices_card();
    main_box.append(&devices_card);

    // Active Pool Card
    let pool_card = create_pool_card();
    main_box.append(&pool_card);

    scrolled.set_child(Some(&main_box));
    scrolled
}

fn create_mining_control() -> GtkBox {
    let container = GtkBox::new(Orientation::Vertical, 12);
    container.set_halign(gtk4::Align::Center);

    let button = Button::builder()
        .label("⏸ Mining")
        .build();
    button.add_css_class("mining-button");
    button.add_css_class("suggested-action");

    container.append(&button);
    container
}

fn create_metrics_cards() -> GtkBox {
    let row = GtkBox::new(Orientation::Horizontal, 16);
    row.set_homogeneous(true);

    // GPU Count Card
    let gpu_card = create_metric_card("4", "GPU'S");
    row.append(&gpu_card);

    // CPU Count Card
    let cpu_card = create_metric_card("1", "CPU");
    row.append(&cpu_card);

    // Profitability Card
    let profit_card = Frame::new(None);
    profit_card.add_css_class("card");
    let profit_box = GtkBox::new(Orientation::Vertical, 8);
    profit_box.set_margin_top(20);
    profit_box.set_margin_bottom(20);
    profit_box.set_margin_start(20);
    profit_box.set_margin_end(20);

    let label = Label::new(Some("CURRENT PROFITABILITY"));
    label.add_css_class("metric-label");
    label.set_halign(gtk4::Align::Start);
    profit_box.append(&label);

    let value = Label::new(Some("0.0191616 BTC / 24h"));
    value.set_markup("<span size='x-large' weight='bold'>0.0191616 BTC</span> <span size='small' color='#6b7280'>/ 24h</span>");
    value.set_halign(gtk4::Align::Start);
    profit_box.append(&value);

    let usd = Label::new(Some("≈ $ 141.69"));
    usd.add_css_class("metric-label");
    usd.set_halign(gtk4::Align::Start);
    profit_box.append(&usd);

    profit_card.set_child(Some(&profit_box));
    row.append(&profit_card);

    row
}

fn create_metric_card(value: &str, label: &str) -> Frame {
    let card = Frame::new(None);
    card.add_css_class("card");

    let card_box = GtkBox::new(Orientation::Vertical, 8);
    card_box.set_margin_top(20);
    card_box.set_margin_bottom(20);
    card_box.set_margin_start(20);
    card_box.set_margin_end(20);

    let value_label = Label::new(Some(value));
    value_label.add_css_class("metric-number");
    value_label.set_halign(gtk4::Align::Center);
    card_box.append(&value_label);

    let desc_label = Label::new(Some(label));
    desc_label.add_css_class("metric-label");
    desc_label.set_halign(gtk4::Align::Center);
    card_box.append(&desc_label);

    card.set_child(Some(&card_box));
    card
}

fn create_balance_card() -> Frame {
    let card = Frame::new(None);
    card.add_css_class("card");

    let card_box = GtkBox::new(Orientation::Vertical, 8);
    card_box.set_margin_top(20);
    card_box.set_margin_bottom(20);
    card_box.set_margin_start(20);
    card_box.set_margin_end(20);

    let label = Label::new(Some("UNPAID BALANCE"));
    label.add_css_class("metric-label");
    label.set_halign(gtk4::Align::Start);
    card_box.append(&label);

    let value = Label::new(Some("0.0191616 BTC"));
    value.set_markup("<span size='xx-large' weight='bold'>0.0191616</span> <span size='large' color='#6b7280'>BTC</span>");
    value.set_halign(gtk4::Align::Start);
    card_box.append(&value);

    let usd = Label::new(Some("≈ $ 141.69"));
    usd.set_markup("<span size='large' color='#6b7280'>≈ $ 141.69</span>");
    usd.set_halign(gtk4::Align::Start);
    card_box.append(&usd);

    card.set_child(Some(&card_box));
    card
}

fn create_devices_card() -> Frame {
    let card = Frame::new(None);
    card.add_css_class("card");

    let card_box = GtkBox::new(Orientation::Vertical, 16);
    card_box.set_margin_top(20);
    card_box.set_margin_bottom(20);
    card_box.set_margin_start(20);
    card_box.set_margin_end(20);

    let title = Label::new(Some("MINING DEVICES"));
    title.set_markup("<span weight='bold' size='large'>MINING DEVICES</span>");
    title.set_halign(gtk4::Align::Start);
    card_box.append(&title);

    // Device list
    let devices = vec![
        ("GPU 0", "125 MH/s", "62°C", "180W"),
        ("GPU 1", "124 MH/s", "64°C", "182W"),
        ("GPU 2", "126 MH/s", "61°C", "179W"),
        ("GPU 3", "125 MH/s", "63°C", "181W"),
        ("CPU 0", "15 MH/s", "58°C", "95W"),
    ];

    for (name, hashrate, temp, power) in devices {
        let device_row = GtkBox::new(Orientation::Horizontal, 12);
        device_row.set_homogeneous(true);

        let name_label = Label::new(Some(name));
        name_label.set_halign(gtk4::Align::Start);
        device_row.append(&name_label);

        let hashrate_label = Label::new(Some(hashrate));
        hashrate_label.set_halign(gtk4::Align::Start);
        device_row.append(&hashrate_label);

        let temp_label = Label::new(Some(temp));
        temp_label.add_css_class("temperature-normal");
        temp_label.set_halign(gtk4::Align::Start);
        device_row.append(&temp_label);

        let power_label = Label::new(Some(power));
        power_label.set_halign(gtk4::Align::Start);
        device_row.append(&power_label);

        card_box.append(&device_row);
    }

    card.set_child(Some(&card_box));
    card
}

fn create_pool_card() -> Frame {
    let card = Frame::new(None);
    card.add_css_class("card");

    let card_box = GtkBox::new(Orientation::Horizontal, 48);
    card_box.set_margin_top(20);
    card_box.set_margin_bottom(20);
    card_box.set_margin_start(20);
    card_box.set_margin_end(20);

    let pool_box = GtkBox::new(Orientation::Vertical, 4);
    let pool_label = Label::new(Some("ACTIVE POOL"));
    pool_label.add_css_class("metric-label");
    pool_label.set_halign(gtk4::Align::Start);
    pool_box.append(&pool_label);

    let pool_value = Label::new(Some("pool.kuber-coin.com:3333"));
    pool_value.set_markup("<span weight='bold'>pool.kuber-coin.com:3333</span>");
    pool_value.set_halign(gtk4::Align::Start);
    pool_box.append(&pool_value);

    card_box.append(&pool_box);

    let share_box = GtkBox::new(Orientation::Vertical, 4);
    share_box.set_halign(gtk4::Align::End);
    let share_label = Label::new(Some("SHARE ACCEPTANCE"));
    share_label.add_css_class("metric-label");
    share_label.set_halign(gtk4::Align::End);
    share_box.append(&share_label);

    let share_value = Label::new(Some("99.2%"));
    share_value.set_markup("<span weight='bold' color='#10b981'>99.2%</span>");
    share_value.set_halign(gtk4::Align::End);
    share_box.append(&share_value);

    card_box.append(&share_box);
    card_box.set_hexpand(true);

    card.set_child(Some(&card_box));
    card
}
