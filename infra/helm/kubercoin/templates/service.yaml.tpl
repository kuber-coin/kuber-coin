apiVersion: v1
kind: Service
metadata:
  name: {{ include "kubercoin.fullname" . }}-api
  labels:
    {{- include "kubercoin.labels" . | nindent 4 }}
    component: api
spec:
  type: {{ .Values.service.type }}
  ports:
  - port: {{ .Values.service.api.port }}
    targetPort: {{ .Values.service.api.targetPort }}
    protocol: TCP
    name: api
  - port: {{ .Values.service.rpc.port }}
    targetPort: {{ .Values.service.rpc.targetPort }}
    protocol: TCP
    name: rpc
  selector:
    {{- include "kubercoin.selectorLabels" . | nindent 4 }}
---
apiVersion: v1
kind: Service
metadata:
  name: {{ include "kubercoin.fullname" . }}-p2p
  labels:
    {{- include "kubercoin.labels" . | nindent 4 }}
    component: p2p
spec:
  type: {{ .Values.service.p2p.type }}
  ports:
  - port: {{ .Values.service.p2p.port }}
    targetPort: p2p
    protocol: TCP
    name: p2p
  selector:
    {{- include "kubercoin.selectorLabels" . | nindent 4 }}
---
apiVersion: v1
kind: Service
metadata:
  name: {{ include "kubercoin.fullname" . }}-metrics
  labels:
    {{- include "kubercoin.labels" . | nindent 4 }}
    component: metrics
spec:
  type: ClusterIP
  ports:
  - port: {{ .Values.service.metrics.port }}
    targetPort: {{ .Values.service.metrics.targetPort }}
    protocol: TCP
    name: metrics
  selector:
    {{- include "kubercoin.selectorLabels" . | nindent 4 }}
