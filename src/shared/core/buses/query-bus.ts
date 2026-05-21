export interface Query { }

export interface QueryHandler<TQuery extends Query, TResult> {
    execute(query: TQuery): Promise<TResult>;
}

export class QueryBus {
    async execute<TQuery extends Query, TResult>(
        handler: QueryHandler<TQuery, TResult>,
        query: TQuery,
    ): Promise<TResult> {
        return handler.execute(query);
    }
}