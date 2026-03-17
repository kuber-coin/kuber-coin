use gtk4::prelude::*;
use gtk4::{Box as GtkBox, Button, Frame, Grid, InfoBar, Label, Orientation, Scale, ScrolledWindow, Switch};

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

    // Warning Banner
    let info_bar = InfoBar::new();
    info_bar.set_message_type(gtk4::MessageType::Warning);
    info_bar.set_show_close_button(false);
    let content = info_bar.content_area().downcast::<GtkBox>().unwrap();
    let warning_label = Label::new(Some("⚠ Overclocking Warning: May void warranty and damage hardware if not done carefully. Always monitor temperatures."));
    content.append(&warning_label);
    main_box.append(&info_bar);

    // GPU Overclocking Cards
    let gpus = vec![
        ("GPU 0", "NVIDIA RTX 3080", "62°C", "180W", "1725 MHz", "9501 MHz", 85, 100, 500, 65),
        ("GPU 1", "NVIDIA RTX 3080", "64°C", "182W", "1720 MHz", "9501 MHz", 85, 95, 500, 68),
        ("GPU 2", "NVIDIA RTX 3080", "61°C", "179W", "1730 MHz", "9501 MHz", 85, 105, 500, 63),
        ("GPU 3", "NVIDIA RTX 3080", "63°C", "181W", "1725 MHz", "9501 MHz", 85, 100, 500, 66),
    ];

    for (name, model, temp, power, core_clock, mem_clock, power_limit, core_offset, mem_offset, fan_speed) in gpus {
        let card = create_overclock_card(
            name,
            model,
            temp,
            power,
            core_clock,
            mem_clock,
            power_limit,
            core_offset,
            mem_offset,
            fan_speed,
        );
        main_box.append(&card);
    }

    scrolled.set_child(Some(&main_box));
    scrolled
}

fn create_overclock_card(
    name: &str,
    model: &str,
    temp: &str,
    power: &str,
    core_clock: &str,
    mem_clock: &str,
    power_limit: i32,
    core_offset: i32,
    mem_offset: i32,
    fan_speed: i32,
) -> Frame {
    let card = Frame::new(None);
    card.add_css_class("card");

    let card_box = GtkBox::new(Orientation::Vertical, 20);
    card_box.set_margin_top(20);
    card_box.set_margin_bottom(20);
    card_box.set_margin_start(20);
    card_box.set_margin_end(20);

    // Header
    let header = GtkBox::new(Orientation::Horizontal, 12);
    let labels_box = GtkBox::new(Orientation::Vertical, 4);
    let name_label = Label::new(Some(name));
    name_label.set_markup(&format!("<span weight='bold' size='large'>{}</span>", name));
    name_label.set_halign(gtk4::Align::Start);
    labels_box.append(&name_label);

    let model_label = Label::new(Some(model));
    model_label.add_css_class("metric-label");
    model_label.set_halign(gtk4::Align::Start);
    labels_box.append(&model_label);

    header.append(&labels_box);
    header.set_hexpand(true);

    let switch = Switch::new();
    switch.set_active(true);
    switch.set_valign(gtk4::Align::Center);
    header.append(&switch);

    card_box.append(&header);

    // Status Indicators
    let status_grid = Grid::builder()
        .column_spacing(24)
        .row_spacing(8)
        .build();

    let indicators = vec![
        ("Temperature", temp),
        ("Power Draw", power),
        ("Core Clock", core_clock),
        ("Memory Clock", mem_clock),
    ];

    for (i, (label, value)) in indicators.iter().enumerate() {
        let metric_box = GtkBox::new(Orientation::Vertical, 4);
        let label_widget = Label::new(Some(label));
        label_widget.add_css_class("metric-label");
        label_widget.set_halign(gtk4::Align::Start);
        metric_box.append(&label_widget);

        let value_widget = Label::new(Some(value));
        value_widget.set_markup(&format!("<span weight='bold' size='large'>{}</span>", value));
        value_widget.set_halign(gtk4::Align::Start);
        metric_box.append(&value_widget);

        status_grid.attach(&metric_box, i as i32, 0, 1, 1);
    }

    card_box.append(&status_grid);

    // Power Limit Slider
    card_box.append(&create_slider("Power Limit", 50.0, 120.0, power_limit as f64, "%"));

    // Core Clock Offset Slider
    card_box.append(&create_slider("Core Clock Offset", -300.0, 300.0, core_offset as f64, " MHz"));

    // Memory Clock Offset Slider
    card_box.append(&create_slider("Memory Clock Offset", -1000.0, 1500.0, mem_offset as f64, " MHz"));

    // Fan Speed Slider
    let fan_box = create_slider("Fan Speed", 0.0, 100.0, fan_speed as f64, "%");
    card_box.append(&fan_box);
    
    let auto_label = Label::new(Some("0 = Auto control"));
    auto_label.add_css_class("metric-label");
    auto_label.set_halign(gtk4::Align::Start);
    card_box.append(&auto_label);

    // Action Buttons
    let button_box = GtkBox::new(Orientation::Horizontal, 12);
    button_box.set_homogeneous(true);

    let apply_btn = Button::with_label("Apply Settings");
    apply_btn.add_css_class("suggested-action");
    button_box.append(&apply_btn);

    let save_btn = Button::with_label("Save Profile");
    button_box.append(&save_btn);

    let reset_btn = Button::with_label("Reset to Default");
    button_box.append(&reset_btn);

    card_box.append(&button_box);

    card.set_child(Some(&card_box));
    card
}

fn create_slider(label: &str, min: f64, max: f64, value: f64, suffix: &str) -> GtkBox {
    let slider_box = GtkBox::new(Orientation::Vertical, 8);

    let header = GtkBox::new(Orientation::Horizontal, 12);
    let label_widget = Label::new(Some(label));
    label_widget.set_markup(&format!("<span weight='bold'>{}</span>", label));
    label_widget.set_halign(gtk4::Align::Start);
    header.append(&label_widget);
    header.set_hexpand(true);

    let value_label = Label::new(Some(&format!("{}{}", value as i32, suffix)));
    value_label.add_css_class("brand-orange");
    value_label.set_halign(gtk4::Align::End);
    header.append(&value_label);

    slider_box.append(&header);

    let scale = Scale::with_range(gtk4::Orientation::Horizontal, min, max, 1.0);
    scale.set_value(value);
    scale.set_draw_value(false);
    slider_box.append(&scale);

    slider_box
}
