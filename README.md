# bench-mq

## Build
```
$ docker build -t bench-mq .
```

## Run
```
$ docker run -it --rm -e RABBITMQ_HOST=amqp://<username>:<password>@<hostname>:5672 -e REPEAT=100 bench-mq
```
