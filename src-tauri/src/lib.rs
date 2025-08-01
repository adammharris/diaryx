// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Use a block expression to assign the correctly configured builder.
    // The compiler will pick one of these blocks and discard the other.
    let builder = {
        #[cfg(target_os = "ios")]
        {
            // This code path is ONLY used for iOS.
            tauri::Builder::default()
                .plugin(tauri_plugin_http::init())
                .plugin(tauri_plugin_log::Builder::new().build())
                .plugin(tauri_plugin_deep_link::init())
                .plugin(tauri_plugin_dialog::init())
                .plugin(tauri_plugin_opener::init())
                .plugin(tauri_plugin_shell::init())
                .plugin(tauri_plugin_fs::init())
                .plugin(tauri_plugin_os::init())
                .plugin(tauri_plugin_virtual_keyboard::init()) // The crate exists here.
        }

        #[cfg(not(target_os = "ios"))]
        {
            // This code path is used for all non-iOS targets (e.g., desktop).
            // It never mentions the virtual keyboard plugin.
            tauri::Builder::default()
                .plugin(tauri_plugin_http::init())
                .plugin(tauri_plugin_log::Builder::new().build())
                .plugin(tauri_plugin_deep_link::init())
                .plugin(tauri_plugin_dialog::init())
                .plugin(tauri_plugin_opener::init())
                .plugin(tauri_plugin_shell::init())
                .plugin(tauri_plugin_fs::init())
                .plugin(tauri_plugin_os::init())
        }
    };

    builder
        .setup(|_app| {
            #[cfg(any(target_os = "linux", target_os = "windows"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
