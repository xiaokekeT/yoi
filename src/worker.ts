import { ActorSystem } from "js-actor"
import { ActorRef } from "js-actor"
import { AbstractActor } from "js-actor"

import { Middleware, Operator, ErrorHandler } from "./server"
import { Success } from "./success"
import { Failure } from "./failure"

export class Worker {
	private nextActor: ActorRef
	private startpoint: ActorRef
	private endpoint: ActorRef
	constructor(system: ActorSystem, operators: Operator[]) {
		const startpoint = createUseActor((req, res, next) => next())
		this.startpoint = this.nextActor = system.actorOf(new startpoint)
		this.endpoint = this.nextActor
		for (let ope of operators) {
			this.endpoint = this.endpoint.getContext().actorOf(new ope)
		}
	}
	public start(context: Success) {
		this.startpoint.tell(context)
	}

	public stop() {
		this.startpoint.getContext().stop()
	}
}

export function createUseActor(mid: Middleware) {
	return class UseActor extends AbstractActor {
		public createReceive() {
			return this.receiveBuilder()
				.match(Success, success =>
					mid(success.req, success.res, (err?: Error) => {
						const message = err ? new Failure(err, success) : success
						this.next(message)
					}))
				.match(Failure, failure => this.next(failure))
				.build()
		}

		public next(message: object) {
			if (this.context.children.size === 0) return
			this.context.children.values().next().value.tell(message)
		}
	}
}

export function createCatchActor(errorHandler: ErrorHandler) {
	return class CatchActor extends AbstractActor {
		public createReceive() {
			return this.receiveBuilder()
				.match(Success, success => this.next(success))
				.match(Failure, ({ error, success }) =>
					errorHandler(error, success.req, success.res, (err?: Error) => {
						const message = err ? new Failure(err, success) : success
						this.next(message)
					}))
				.build()
		}

		public next(message: object) {
			if (this.context.children.size === 0) return
			this.context.children.values().next().value.tell(message)
		}
	}
}
