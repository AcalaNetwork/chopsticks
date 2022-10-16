use smoldot::executor::host::{Config, HeapPages, HostVm, HostVmPrototype};

fn main() {
    let wasm_binary_code: &[u8] = include_bytes!("./acala-2100.wasm");
	let block = hex_literal::hex!("000000000000000000000000000000000000000000000000000000000000000000010c5745a5d42bcfbe0a644d5a2a4e22e2ff0fd378d48208ecfacea5b7e05a7403170a2e7597b7b7e3d84c05391d139a62b157e78786d8c082f29dcf4c1113140000");

    // Start executing a function on the runtime.
    let mut vm: HostVm = {
        let prototype = HostVmPrototype::new(Config {
            module: &wasm_binary_code,
            heap_pages: HeapPages::from(2048),
            exec_hint: smoldot::executor::vm::ExecHint::Oneshot,
            allow_unresolved_imports: false,
        })
        .unwrap();
        prototype.run("Core_execute_block", &block).unwrap().into()
    };

    // We need to answer the calls that the runtime might perform.
    loop {
        match vm {
            HostVm::ReadyToRun(runner) => vm = runner.run(),
            HostVm::Finished(finished) => {
                println!("Finished: {:x?}", finished.value().as_ref());
                println!("Success!");
                break;
            }
            HostVm::Error { error, .. } => {
                println!("Runtime: Error: {:?}", error);
				break;
            }
			HostVm::LogEmit(log) => {
				println!("Runtime: {}", log);
				vm = log.resume();
			}
			HostVm::ExternalStorageGet(req) => {
                println!(
                    "Runtime requires the storage value at {:?}",
                    req.key().as_ref()
                );
                // Injects the value into the virtual machine and updates the state.
                vm = req.resume(None); // Just a stub
            }
			HostVm::ExternalStorageSet(req) => {
				let val = if let Some(val) = req.value() {
					val.as_ref().to_vec()
				} else {
					Vec::new()
				};
				println!(
					"Runtime wants to set the storage value at {:?} to {:?}",
					req.key().as_ref(),
					val
				);
				// Updates the state.
				vm = req.resume();
			}
            vm=> {
				println!("vm: {:?}", vm);
				break;
			},
        }
    }
}
