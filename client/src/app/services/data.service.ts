import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private url: string = "http://localhost:5000/api/v1/";

  constructor(private http: HttpClient) { }

  combineUrls(endPoint: string){
    return `${this.url}${endPoint}`
  }

  fetch(endPoint: string){
    return this.http.get(this.combineUrls(endPoint));
  }

  fetchByID(){
    return this.http.get('http://localhost:5000/api/v1/modules/disd1234');
  }
}