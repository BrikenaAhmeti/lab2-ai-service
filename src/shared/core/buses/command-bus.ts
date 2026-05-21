export interface Command { }

export interface CommandHandler<TCommand extends Command, TResult = void> {
    execute(command: TCommand): Promise<TResult>;
}

export class CommandBus {
    async execute<TCommand extends Command, TResult>(
        handler: CommandHandler<TCommand, TResult>,
        command: TCommand,
    ): Promise<TResult> {
        return handler.execute(command);
    }
}