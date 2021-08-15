import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  router: string;
  currentRoute: string = ''
  constructor(private _router: Router){
    this.router = _router.url; 
  }

  filterOtherComponents(){
    if(this._router.url === '/login') return false;
    return true
  }
  
  hideOnHome(){
    if(this._router.url === '/') return false;
    else if(this._router.url === '/login') return false;
    return true
  }

  getCuurentRoute(){
    return this.currentRoute = this._router.url.replace('/', '').replace('_', ' ')
  }

  //Route Name

  title = 'student-hub';

  profileMenu: boolean = false;

  authenticated: boolean = false

  toggleMenu(){
    this.profileMenu = !this.profileMenu;
  }
  
  getCurrentDate(){
    return new Date();
  }
  
}
