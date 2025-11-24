FROM golang:1.20-alpine AS build
WORKDIR /src
COPY . .
RUN go mod tidy
RUN go build -o /kuber-chain ./cmd/node

FROM alpine:3.18
COPY --from=build /kuber-chain /usr/local/bin/kuber-chain
EXPOSE 26657
CMD ["kuber-chain"]
