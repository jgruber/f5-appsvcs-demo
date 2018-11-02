FROM nginx

RUN rm /etc/nginx/conf.d/default.conf
COPY ./default.conf /etc/nginx/conf.d/default.conf

WORKDIR /usr/share/nginx/html

# copy application into container
COPY ./assets ./assets
COPY ./index.html ./index.html
COPY ./icontrollx ./icontrollx

EXPOSE 80
