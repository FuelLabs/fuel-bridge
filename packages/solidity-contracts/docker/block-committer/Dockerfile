FROM ghcr.io/fuellabs/fuel-block-committer:sha-77607e4

ARG COMMITER_IP=0.0.0.0
ARG COMMITER_PORT=8888

# dependencies
ENV DEBIAN_FRONTEND=noninteractive
RUN apt update && apt install -y curl jq && rm -rf /var/lib/apt/lists/*

# copy chain config
WORKDIR /block-committer

# expose fuel node port
ENV HOST="${COMMITER_IP}"
ENV PORT="${COMMITER_PORT}"

EXPOSE ${PORT}

# copy over script and run
COPY ./block-committer.sh .
ENTRYPOINT ["sh", "./block-committer.sh"]
