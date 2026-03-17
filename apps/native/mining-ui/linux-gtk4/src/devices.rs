use gtk4::prelude::*;
use gtk4::{Box as GtkBox, Frame, Grid, Label, Orientation, ProgressBar, ScrolledWindow, Switch};

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

    let title = Label::new(Some("Mining Devices"));
    title.set_markup("<span weight='bold' size='xx-large'>Mining Devices</span>");
    title.set_halign(gtk4::Align::Start);
    main_box.append(&title);

    // GPU Devices
    let devices = vec![
        ("GPU 0", "NVIDIA GeForce RTX 3080", "125 MH/s", "62°C", "180W", "65%", 98, 85),
        ("GPU 1", "NVIDIA GeForce RTX 3080", "124 MH/s", "64°C", "182W", "68%", 97, 84),
        ("GPU 2", "NVIDIA GeForce RTX 3080", "126 MH/s", "61°C", "179W", "63%", 99, 86),
        ("GPU 3", "NVIDIA GeForce RTX 3080", "125 MH/s", "63°C", "181W", "66%", 98, 85),
        ("CPU 0", "AMD Ryzen 9 5950X", "15 MH/s", "58°C", "95W", "45%", 100, 28),
    ];

    for (name, model, hashrate, temp, power, fan, gpu_util, mem_util) in devices {
        let device_card = create_device_card(name, model, hashrate, temp, power, fan, gpu_util, mem_util);
        main_box.append(&device_card);
    }

    scrolled.set_child(Some(&main_box));
    scrolled
}

fn create_device_card(
    name: &str,
    model: &str,
    hashrate: &str,
    temp: &str,
    power: &str,
    fan: &str,
    gpu_util: i32,
    mem_util: i32,
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
    let header_labels = GtkBox::new(Orientation::Vertical, 4);
    let name_label = Label::new(Some(name));
    name_label.set_markup(&format!("<span weight='bold' size='large'>{}</span>", name));
    name_label.set_halign(gtk4::Align::Start);
    header_labels.append(&name_label);

    let model_label = Label::new(Some(model));
    model_label.add_css_class("metric-label");
    model_label.set_halign(gtk4::Align::Start);
    header_labels.append(&model_label);

    header.append(&header_labels);
    header.set_hexpand(true);

    let switch = Switch::new();
    switch.set_active(true);
    switch.set_valign(gtk4::Align::Center);
    header.append(&switch);

    card_box.append(&header);

    // Metrics Grid
    let metrics_grid = Grid::builder()
        .column_spacing(24)
        .row_spacing(12)
        .build();

    let metrics = vec![
        ("Hashrate", hashrate),
        ("Temperature", temp),
        ("Power", power),
        ("Fan Speed", fan),
    ];

    for (i, (label, value)) in metrics.iter().enumerate() {
        let metric_box = GtkBox::new(Orientation::Vertical, 4);
        let label_widget = Label::new(Some(label));
        label_widget.add_css_class("metric-label");
        label_widget.set_halign(gtk4::Align::Start);
        metric_box.append(&label_widget);

        let value_widget = Label::new(Some(value));
        value_widget.set_markup(&format!("<span weight='bold' size='x-large'>{}</span>", value));
        value_widget.set_halign(gtk4::Align::Start);
        if label == &"Temperature" {
            value_widget.add_css_class("temperature-normal");
        }
        metric_box.append(&value_widget);

        metrics_grid.attach(&metric_box, i as i32, 0, 1, 1);
    }

    card_box.append(&metrics_grid);

    // Utilization Progress Bars
    let gpu_util_box = GtkBox::new(Orientation::Vertical, 8);
    let gpu_util_header = GtkBox::new(Orientation::Horizontal, 12);
    let gpu_util_label = Label::new(Some("GPU Utilization"));
    gpu_util_label.add_css_class("metric-label");
    gpu_util_label.set_halign(gtk4::Align::Start);
    gpu_util_header.append(&gpu_util_label);
    gpu_util_header.set_hexpand(true);

    let gpu_util_value = Label::new(Some(&format!("{}%", gpu_util)));
    gpu_util_value.set_halign(gtk4::Align::End);
    gpu_util_header.append(&gpu_util_value);
    gpu_util_box.append(&gpu_util_header);

    let gpu_progress = ProgressBar::new();
    gpu_progress.set_fraction(gpu_util as f64 / 100.0);
    gpu_util_box.append(&gpu_progress);
    card_box.append(&gpu_util_box);

    let mem_util_box = GtkBox::new(Orientation::Vertical, 8);
    let mem_util_header = GtkBox::new(Orientation::Horizontal, 12);
    let mem_util_label = Label::new(Some("Memory Utilization"));
    mem_util_label.add_css_class("metric-label");
    mem_util_label.set_halign(gtk4::Align::Start);
    mem_util_header.append(&mem_util_label);
    mem_util_header.set_hexpand(true);

    let mem_util_value = Label::new(Some(&format!("{}%", mem_util)));
    mem_util_value.set_halign(gtk4::Align::End);
    mem_util_header.append(&mem_util_value);
    mem_util_box.append(&mem_util_header);

    let mem_progress = ProgressBar::new();
    mem_progress.set_fraction(mem_util as f64 / 100.0);
    mem_util_box.append(&mem_progress);
    card_box.append(&mem_util_box);

    card.set_child(Some(&card_box));
    card
}
