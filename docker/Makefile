build:
	docker compose --env-file ./envs/ports.env build

up:
	docker compose --env-file ./envs/ports.env up -d --build

stop:
	docker compose stop

clean:
	docker compose down --rmi local -v

logs:
	docker compose logs -f

