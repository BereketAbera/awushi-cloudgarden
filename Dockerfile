# Awushi's DevOps World, as a static image for devops.bereket.dev.
#
# The build stage runs on the builder's own platform, because its output (dist/) is plain files that run anywhere. The
# runtime stage only copies files onto nginx-unprivileged and has no RUN, so one Dockerfile gives linux/amd64 for the
# VPS and linux/arm64 for a laptop, and neither needs emulation on the other's builder. Both base images are pinned by
# digest; bump the tag and the digest together.
#
# There is no "# syntax=" line. BuildKit's built-in Dockerfile frontend reads everything here, so the two bases are the
# only images a build pulls. A syntax line would make every build fetch a frontend image by a tag that can move. That
# image decides what the build does, and with --provenance=false nothing records which one it was.
ARG NODE_IMAGE=node:24.22.2-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.30.6-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03

FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
WORKDIR /src
ENV CI=true NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false
COPY package.json package-lock.json ./
RUN npm ci --no-audit
COPY . .
# npm run build is tsc -b && vite build, as locally. Vite copies public/, with the GLBs and branding images, into dist/.
RUN npm run build \
 && test -f dist/index.html \
 && test -f dist/assets/awushi.glb
# deploy/nginx/default.conf serves these .gz files with gzip_static, so nginx never compresses a model per request.
# -k keeps each original for clients that do not accept gzip. The GLBs shrink to between a fifth and a third.
RUN find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.svg' -o -name '*.json' -o -name '*.glb' \) \
      -exec gzip -9 -k {} + \
 && test -f dist/index.html.gz \
 && test -f dist/assets/awushi.glb.gz

FROM ${NGINX_IMAGE} AS runtime
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY deploy/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /src/dist /usr/share/nginx/html
# nginx-unprivileged runs as uid 101 and listens on 8080. Its pid and temp files live in /tmp, which Kubernetes mounts as
# an emptyDir so the root filesystem can stay read-only. The copied files are root's, so nginx can read but not change them.
EXPOSE 8080
USER 101
