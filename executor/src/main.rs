use runner_api::RpcApiClient;

mod runner_api;
mod task;

#[derive(Debug, Clone, clap::Parser)]
pub struct Command {
    #[clap(long, default_value = "ws://localhost:8000")]
    runner_url: String,

    #[clap(long, default_value = "0")]
    task_id: u32,
}

#[tokio::main]
async fn main() -> Result<(), jsonrpsee::core::Error> {
    real_main().await
}

async fn real_main() -> Result<(), jsonrpsee::core::Error> {
    let config = <Command as clap::Parser>::parse();
    let task_id = config.task_id;

    println!("Starting {}", task_id);

    let client = runner_api::client(&config.runner_url).await?;

    let task = client.get_task(task_id).await?;

    let res = task.run(task_id, &client).await?;

    println!("Done {:?}", res);

    Ok(())
}
