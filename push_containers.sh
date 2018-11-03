repo='jgruber'

docker tag f5-appsvcs-demo:latest $repo/f5-appsvcs-demo:latest
docker tag f5-appsvcs-demo-web:latest $repo/f5-appsvcs-demo-web:latest

docker push $repo/f5-appsvcs-demo:latest
docker push $repo/f5-appsvcs-demo-web:latest

