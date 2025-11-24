package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/gorilla/mux"
)

func health(w http.ResponseWriter, _ *http.Request) {
	json.NewEncoder(w).Encode(map[string]string{
		"service": "kuber-chain",
		"status":  "ok",
	})
}

func rpc(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	json.NewDecoder(r.Body).Decode(&req)

	res := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      req["id"],
		"result":  "stub-response",
	}

	json.NewEncoder(w).Encode(res)
}

func main() {
	r := mux.NewRouter()
	r.HandleFunc("/health", health).Methods("GET")
	r.HandleFunc("/rpc", rpc).Methods("POST")

	port := os.Getenv("PORT")
	if port == "" {
		port = "26657"
	}

	log.Printf("Kuber Chain running on %s", port)
	http.ListenAndServe(":"+port, r)
}
