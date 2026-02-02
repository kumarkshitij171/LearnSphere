FROM jenkins/jenkins:2.414.2-jdk11

USER root

RUN apt-get update && apt-get install -y \
    lsb-release \
    python3-pip \
    curl \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSLo /usr/share/keyrings/docker-archive-keyring.asc \
    https://download.docker.com/linux/debian/gpg

RUN echo "deb [arch=$(dpkg --print-architecture) \
    signed-by=/usr/share/keyrings/docker-archive-keyring.asc] \
    https://download.docker.com/linux/debian \
    $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list

RUN apt-get update && apt-get install -y docker-ce-cli \
 && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 999 docker || true \
 && usermod -aG docker jenkins

USER jenkins

# RUN jenkins-plugin-cli --plugins \
#     blueocean \
#     docker-workflow
