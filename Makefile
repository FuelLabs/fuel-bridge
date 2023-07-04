build:
	docker compose --env-file ./envs/ports.env build

up:
	docker compose --env-file ./envs/ports.env up -d --build

stop:
	docker compose stop

clean:
	docker compose down --rmi local -v --remove-orphans

logs:
	docker compose logs -f -n 100
