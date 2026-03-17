use gtk4::prelude::*;
use gtk4::{Box as GtkBox, DrawingArea, Frame, Label, Orientation, RadioButton, ScrolledWindow};

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

    // Time Range Selector
    let range_box = GtkBox::new(Orientation::Horizontal, 12);
    let radio_24h = RadioButton::with_label("24 Hours");
    radio_24h.set_active(true);
    range_box.append(&radio_24h);

    let radio_7d = RadioButton::with_label_from_widget(&radio_24h, Some("7 Days"));
    range_box.append(&radio_7d);

    let radio_30d = RadioButton::with_label_from_widget(&radio_24h, Some("30 Days"));
    range_box.append(&radio_30d);

    let radio_all = RadioButton::with_label_from_widget(&radio_24h, Some("All Time"));
    range_box.append(&radio_all);

    main_box.append(&range_box);

    // Profit Chart
    main_box.append(&create_chart_card(
        "Profitability History",
        "Total Profit",
        "0.1524 BTC",
        "Avg Daily",
        "0.0191 BTC",
    ));

    // Hashrate Chart
    main_box.append(&create_chart_card(
        "Hashrate History",
        "Current",
        "515 MH/s",
        "Average",
        "512 MH/s",
    ));

    // Temperature Chart
    main_box.append(&create_chart_card(
        "GPU Temperature History",
        "Max Temp",
        "64°C",
        "Avg Temp",
        "62°C",
    ));

    // Power Chart
    main_box.append(&create_chart_card(
        "Power Consumption",
        "Current",
        "817W",
        "Est. Monthly Cost",
        "$88.32",
    ));

    scrolled.set_child(Some(&main_box));
    scrolled
}

fn create_chart_card(
    title: &str,
    metric1_label: &str,
    metric1_value: &str,
    metric2_label: &str,
    metric2_value: &str,
) -> Frame {
    let card = Frame::new(None);
    card.add_css_class("card");

    let card_box = GtkBox::new(Orientation::Vertical, 16);
    card_box.set_margin_top(20);
    card_box.set_margin_bottom(20);
    card_box.set_margin_start(20);
    card_box.set_margin_end(20);

    // Header
    let header = GtkBox::new(Orientation::Horizontal, 24);
    let title_label = Label::new(Some(title));
    title_label.set_markup(&format!("<span weight='bold' size='large'>{}</span>", title));
    title_label.set_halign(gtk4::Align::Start);
    header.append(&title_label);
    header.set_hexpand(true);

    let metrics_box = GtkBox::new(Orientation::Horizontal, 16);

    let metric1_box = GtkBox::new(Orientation::Vertical, 4);
    let m1_label = Label::new(Some(metric1_label));
    m1_label.add_css_class("metric-label");
    m1_label.set_halign(gtk4::Align::End);
    metric1_box.append(&m1_label);

    let m1_value = Label::new(Some(metric1_value));
    m1_value.set_markup(&format!("<span weight='bold'>{}</span>", metric1_value));
    m1_value.set_halign(gtk4::Align::End);
    metric1_box.append(&m1_value);

    metrics_box.append(&metric1_box);

    let metric2_box = GtkBox::new(Orientation::Vertical, 4);
    let m2_label = Label::new(Some(metric2_label));
    m2_label.add_css_class("metric-label");
    m2_label.set_halign(gtk4::Align::End);
    metric2_box.append(&m2_label);

    let m2_value = Label::new(Some(metric2_value));
    m2_value.set_markup(&format!("<span weight='bold' color='#627eea'>{}</span>", metric2_value));
    m2_value.set_halign(gtk4::Align::End);
    metric2_box.append(&m2_value);

    metrics_box.append(&metric2_box);
    header.append(&metrics_box);

    card_box.append(&header);

    // Chart Drawing Area (placeholder)
    let drawing_area = DrawingArea::new();
    drawing_area.set_content_height(300);
    
    drawing_area.set_draw_func(|_, cr, width, height| {
        // Simple placeholder chart
        cr.set_source_rgb(0.06, 0.09, 0.18);
        let _ = cr.rectangle(0.0, 0.0, width as f64, height as f64);
        let _ = cr.fill();

        // Draw a simple line chart placeholder
        cr.set_source_rgb(0.38, 0.49, 0.92);
        cr.set_line_width(2.0);
        
        let points = 24;
        for i in 0..points {
            let x = (width as f64 / points as f64) * i as f64;
            let y = height as f64 * 0.5 + (i as f64 * 0.1).sin() * height as f64 * 0.3;
            
            if i == 0 {
                let _ = cr.move_to(x, y);
            } else {
                let _ = cr.line_to(x, y);
            }
        }
        let _ = cr.stroke();
    });

    card_box.append(&drawing_area);

    card.set_child(Some(&card_box));
    card
}
