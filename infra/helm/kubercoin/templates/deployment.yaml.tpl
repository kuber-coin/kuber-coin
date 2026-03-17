apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "kubercoin.fullname" . }}
  labels:
    {{- include "kubercoin.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "kubercoin.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      annotations:
        {{- with .Values.podAnnotations }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
      labels:
        {{- include "kubercoin.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      serviceAccountName: {{ include "kubercoin.serviceAccountName" . }}
      securityContext:
        {{- toYaml .Values.podSecurityContext | nindent 8 }}
      containers:
      - name: {{ .Chart.Name }}
        securityContext:
          {{- toYaml .Values.securityContext | nindent 12 }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - name: rpc
          containerPort: 8634
          protocol: TCP
        - name: p2p
          containerPort: 8633
          protocol: TCP
        env:
        - name: KUBERCOIN_NETWORK
          value: {{ .Values.config.network | quote }}
        - name: KUBERCOIN_LOG_LEVEL
          value: {{ .Values.config.logLevel | quote }}
        - name: KUBERCOIN_DATA_DIR
          value: "/var/lib/kubercoin"
        - name: KUBERCOIN_RPC_ADDR
          value: "0.0.0.0:8634"
        - name: KUBERCOIN_P2P_ADDR
          value: "0.0.0.0:8633"
        {{- with .Values.env }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
        livenessProbe:
          {{- toYaml .Values.livenessProbe | nindent 10 }}
        readinessProbe:
          {{- toYaml .Values.readinessProbe | nindent 10 }}
        resources:
          {{- toYaml .Values.resources | nindent 10 }}
        volumeMounts:
        - name: data
          mountPath: /var/lib/kubercoin
      volumes:
      - name: data
        {{- if .Values.persistence.enabled }}
        persistentVolumeClaim:
          claimName: {{ include "kubercoin.fullname" . }}
        {{- else }}
        emptyDir: {}
        {{- end }}
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
        {{- end }}
